import { randomUUID } from 'crypto';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { recalculateGangStats } from '../utils/playerMapper.js';

const VALID_CT_KEYS = ['ct_nw', 'ct_ne', 'ct_sw', 'ct_se'];
const VALID_MEMBER_TYPES = [
  'capanga',
  'frente',
  'executor',
  'assassino',
  'muralha',
  'certeiro',
  'motorista',
  'nitro',
];

function ensureGang(player) {
  if (!player.gang) {
    player.gang = {
      members: [],
      trainingSlots: [],
      stats: recalculateGangStats([]),
      updatedAtIso: null,
    };
  }

  if (!Array.isArray(player.gang.members)) {
    player.gang.members = [];
  }

  if (!Array.isArray(player.gang.trainingSlots)) {
    player.gang.trainingSlots = [];
  }

  return player.gang;
}

function getBarracoLevel(player) {
  return Math.max(1, Math.floor(Number(player.niveis?.barracoLevel || 1)));
}

function calculateTrainingConfig(player) {
  const barracoLevel = getBarracoLevel(player);

  return {
    barracoLevel,
    quantity: barracoLevel * 10,
    durationMs: barracoLevel * 2 * 60 * 1000,
    cost: Math.floor(1000 * barracoLevel * 1.1),
  };
}

function updateCompletedTrainingSlots(player) {
  const gang = ensureGang(player);
  const now = Date.now();
  let changed = false;

  gang.trainingSlots = gang.trainingSlots.map((slot) => {
    if (slot.status === 'training' && now >= Number(slot.endsAt)) {
      changed = true;
      const plainSlot = typeof slot.toObject === 'function' ? slot.toObject() : slot;
      return {
        ...plainSlot,
        status: 'completed',
      };
    }

    return slot;
  });

  if (changed) {
    gang.updatedAtIso = new Date().toISOString();
    player.markModified('gang.trainingSlots');
    player.markModified('gang.updatedAtIso');
  }

  return changed;
}

function buildTrainingPayload(player) {
  const gang = ensureGang(player);
  const plainGang = player.gang?.toObject ? player.gang.toObject() : player.gang;

  return {
    ok: true,
    success: true,
    gang: plainGang,
    trainingSlots: gang.trainingSlots,
    balances: player.balances,
    playerBalances: player.balances,
  };
}

async function saveAndBroadcastTrainingState(player, event = 'training:updated') {
  ensureGang(player);
  player.gang.stats = recalculateGangStats(player.gang.members);
  player.gang.updatedAtIso = new Date().toISOString();
  bumpVersion(player);

  player.markModified('gang');
  player.markModified('balances');

  await player.save();

  const payload = buildTrainingPayload(player);
  emitToPlayer(String(player._id), event, payload);
  emitToPlayer(String(player._id), 'gangUpdate', { gang: payload.gang });

  return payload;
}

export async function startTraining(req, res) {
  try {
    const player = req.player;
    const gang = ensureGang(player);
    const { ctKey, troopType } = req.body || {};

    if (!VALID_CT_KEYS.includes(String(ctKey))) {
      return res.status(400).json({ error: 'CT inválido' });
    }

    if (!VALID_MEMBER_TYPES.includes(String(troopType))) {
      return res.status(400).json({ error: 'Tipo de membro inválido' });
    }

    const completedChanged = updateCompletedTrainingSlots(player);

    const ctAlreadyOccupied = gang.trainingSlots.some((slot) => {
      return String(slot.ctKey) === String(ctKey);
    });

    if (ctAlreadyOccupied) {
      if (completedChanged) await saveAndBroadcastTrainingState(player);
      return res.status(409).json({ error: 'Este CT já possui um treinamento pendente' });
    }

    if (gang.trainingSlots.length >= 4) {
      if (completedChanged) await saveAndBroadcastTrainingState(player);
      return res.status(409).json({ error: 'Todos os CTs já estão ocupados' });
    }

    const { quantity, durationMs, cost } = calculateTrainingConfig(player);
    const dirtyMoney = Number(player.balances?.dirtyMoney || 0);

    if (dirtyMoney < cost) {
      if (completedChanged) await saveAndBroadcastTrainingState(player);
      return res.status(400).json({ error: 'Dinheiro sujo insuficiente para iniciar o treinamento' });
    }

    const startedAt = Date.now();
    const slot = {
      id: randomUUID(),
      ctKey: String(ctKey),
      troopType: String(troopType),
      quantity,
      startedAt,
      endsAt: startedAt + durationMs,
      status: 'training',
      cost,
    };

    player.balances.dirtyMoney = Math.max(0, dirtyMoney - cost);
    gang.trainingSlots.push(slot);

    const payload = await saveAndBroadcastTrainingState(player);

    return res.status(201).json({
      ...payload,
      message: 'Treinamento iniciado',
    });
  } catch (error) {
    console.error('Erro em startTraining:', error);
    return res.status(500).json({ error: 'Erro ao iniciar treinamento' });
  }
}

export async function collectTraining(req, res) {
  try {
    const player = req.player;
    const gang = ensureGang(player);
    const { slotId } = req.body || {};

    if (!slotId) {
      return res.status(400).json({ error: 'slotId é obrigatório' });
    }

    updateCompletedTrainingSlots(player);

    const slotIndex = gang.trainingSlots.findIndex((slot) => String(slot.id) === String(slotId));

    if (slotIndex < 0) {
      return res.status(404).json({ error: 'Treinamento não encontrado' });
    }

    const slot = gang.trainingSlots[slotIndex];

    if (Date.now() < Number(slot.endsAt)) {
      return res.status(400).json({ error: 'Treinamento ainda não terminou' });
    }

    const troopType = String(slot.troopType);
    if (!VALID_MEMBER_TYPES.includes(troopType)) {
      return res.status(400).json({ error: 'Tipo de membro inválido no treinamento' });
    }

    const collectedAt = new Date().toISOString();
    const quantity = Math.max(1, Math.floor(Number(slot.quantity || 1)));

    const newMembers = Array.from({ length: quantity }, (_, index) => ({
      id: `member_${player._id}_${Date.now()}_${index}_${randomUUID()}`,
      type: troopType,
      level: 1,
      status: 'ativo',
      recruitedAt: collectedAt,
      trainingEndsAt: null,
      injuryEndsAt: null,
    }));

    gang.members.push(...newMembers);
    gang.trainingSlots.splice(slotIndex, 1);

    const payload = await saveAndBroadcastTrainingState(player);

    return res.json({
      ...payload,
      message: `${quantity} membros coletados`,
      createdMembers: newMembers,
    });
  } catch (error) {
    console.error('Erro em collectTraining:', error);
    return res.status(500).json({ error: 'Erro ao coletar treinamento' });
  }
}

export async function getGangStatus(req, res) {
  try {
    const player = req.player;
    const changed = updateCompletedTrainingSlots(player);

    if (changed) {
      const payload = await saveAndBroadcastTrainingState(player);
      return res.json(payload);
    }

    return res.json(buildTrainingPayload(player));
  } catch (error) {
    console.error('Erro em getGangStatus:', error);
    return res.status(500).json({ error: 'Erro ao obter status do treinamento' });
  }
}

/**
 * Compatibilidade temporária com rota antiga.
 * Não persiste membros enviados pelo frontend, porque o backend é authoritative.
 */
export async function persistTrainingState(req, res) {
  try {
    return getGangStatus(req, res);
  } catch (error) {
    console.error('Erro em persistTrainingState:', error);
    return res.status(500).json({ error: 'Erro ao obter status do treinamento' });
  }
}
