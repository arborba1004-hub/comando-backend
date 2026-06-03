import { randomUUID } from 'crypto';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { mergePlayerState, recalculateGangStats } from '../utils/playerMapper.js';
import { ECONOMY } from '../config/economyConfig.js';
import Player from '../models/Player.js';
import {
  applyBarracoGangStatSourceToList,
  buildGangStatSnapshot,
} from '../services/gangStatisticsService.js';

const VALID_CT_KEYS = ['ct_nw', 'ct_ne', 'ct_sw', 'ct_se'];
const VALID_MEMBER_TYPES = [
  'capanga', 'frente', 'executor', 'assassino',
  'muralha', 'certeiro', 'motorista', 'nitro',
];

// Multiplicador de custo por tipo. O custo base vem de config/economyConfig.js.
const TROOP_COST_MULTIPLIER = {
  capanga: 1.0,
  frente: 1.1,
  muralha: 1.25,
  motorista: 1.35,
  nitro: 1.4,
  certeiro: 1.5,
  assassino: 1.65,
  executor: 1.8,
};

// Duração em minutos por nível treinado (independente do barraco)
const TRAINING_DURATION_MIN_BY_LEVEL = {
  1: 2,
  2: 8,
  3: 20,
  4: 45,
  5: 90,
  6: 180,
  7: 360,
  8: 600,
  9: 960,
  10: 1440,
};

const LEVEL_COST_MULTIPLIER_BASE = 1.32;

const TRAINING_LOCK_STALE_MS = 90 * 1000;

async function acquireTrainingLock(playerId, lockId) {
  const staleIso = new Date(Date.now() - TRAINING_LOCK_STALE_MS).toISOString();
  return Player.findOneAndUpdate(
    {
      _id: playerId,
      $or: [
        { 'operationLocks.training.id': null },
        { 'operationLocks.training.id': '' },
        { 'operationLocks.training.atIso': null },
        { 'operationLocks.training.atIso': { $lte: staleIso } },
        { operationLocks: { $exists: false } },
      ],
    },
    {
      $set: {
        'operationLocks.training.id': lockId,
        'operationLocks.training.atIso': new Date().toISOString(),
      },
    },
    { new: true },
  );
}

async function releaseTrainingLock(playerId, lockId) {
  if (!playerId || !lockId) return;
  await Player.updateOne(
    { _id: playerId, 'operationLocks.training.id': lockId },
    { $set: { 'operationLocks.training.id': null, 'operationLocks.training.atIso': null } },
  );
}

function clearTrainingLockOnDocument(player) {
  if (!player) return;
  player.operationLocks = player.operationLocks || {};
  player.operationLocks.training = { id: null, atIso: null };
  if (typeof player.markModified === 'function') player.markModified('operationLocks');
}


function ensureGang(player) {
  if (!player.gang) {
    player.gang = {
      members: [],
      trainingSlots: [],
      stats: recalculateGangStats([]),
      statSources: [],
      statSnapshot: null,
      updatedAtIso: null,
    };
  }
  if (!Array.isArray(player.gang.members)) player.gang.members = [];
  if (!Array.isArray(player.gang.trainingSlots)) player.gang.trainingSlots = [];
  if (!Array.isArray(player.gang.statSources)) player.gang.statSources = [];
  return player.gang;
}

function getBarracoLevel(player) {
  return Math.max(1, Math.floor(Number(player.niveis?.barracoLevel || 1)));
}

function getMaxTroopLevel(barracoLevel) {
  return Math.max(1, Math.min(10, Math.floor(barracoLevel / 10) + 1));
}

function calculateTrainingConfig(player, troopType, troopLevel) {
  const barracoLevel = getBarracoLevel(player);
  const maxLevel = getMaxTroopLevel(barracoLevel);
  const level = Math.max(1, Math.min(maxLevel, Math.floor(Number(troopLevel) || 1)));

  const quantity = Math.max(1, Math.floor(barracoLevel * ECONOMY.TRAINING.quantityPerBarracoLevel));

  const troopMultiplier = TROOP_COST_MULTIPLIER[troopType] ?? 1;
  const levelMultiplier = Math.pow(LEVEL_COST_MULTIPLIER_BASE, level - 1);
  const cost = Math.floor(
    ECONOMY.TRAINING.baseCostDirty
      * Math.pow(barracoLevel, ECONOMY.TRAINING.levelExponent)
      * troopMultiplier
      * levelMultiplier
  );

  const durationMinutes = TRAINING_DURATION_MIN_BY_LEVEL[level] ?? 2;
  const durationMs = durationMinutes * 60 * 1000;

  return {
    barracoLevel,
    maxLevel,
    level,
    quantity,
    durationMs,
    durationMinutes,
    cost,
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
      return { ...plainSlot, status: 'completed' };
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
  const barracoLevel = getBarracoLevel(player);

  return {
    ok: true,
    success: true,
    gang: plainGang,
    trainingSlots: gang.trainingSlots,
    balances: player.balances,
    playerBalances: player.balances,
    player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    config: {
      barracoLevel,
      maxTroopLevel: getMaxTroopLevel(barracoLevel),
    },
  };
}

async function saveAndBroadcastTrainingState(player, event = 'training:updated') {
  ensureGang(player);
  player.gang.stats = recalculateGangStats(player.gang.members);
  player.gang.statSources = applyBarracoGangStatSourceToList(
    player.gang.statSources || [],
    getBarracoLevel(player)
  );
  player.gang.statSnapshot = buildGangStatSnapshot(player.gang.members || [], player.gang.statSources);
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

// ─────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────

export async function startTraining(req, res) {
  let trainingLockId = null;
  let lockedPlayerId = null;

  try {
    const initialPlayer = req.player;
    if (!initialPlayer?._id) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { ctKey, troopType, troopLevel } = req.body || {};

    if (!VALID_CT_KEYS.includes(String(ctKey))) {
      return res.status(400).json({ error: 'CT inválido' });
    }
    if (!VALID_MEMBER_TYPES.includes(String(troopType))) {
      return res.status(400).json({ error: 'Tipo de membro inválido' });
    }

    trainingLockId = randomUUID();
    lockedPlayerId = initialPlayer._id;
    const player = await acquireTrainingLock(lockedPlayerId, trainingLockId);
    if (!player) {
      trainingLockId = null;
      return res.status(409).json({
        error: 'Outro treinamento está sendo processado. Tente novamente em instantes.',
        reason: 'training_operation_in_progress',
      });
    }

    const gang = ensureGang(player);

    if (player?.punishments?.dirtyMoneyBlocked) {
      return res.status(423).json({
        error: 'Dinheiro sujo bloqueado. Treinamento indisponível durante a punição.',
        reason: 'dirty_money_blocked',
      });
    }

    const barracoLevel = getBarracoLevel(player);
    const maxLevel = getMaxTroopLevel(barracoLevel);
    const requestedLevel = Math.floor(Number(troopLevel) || 1);

    if (requestedLevel < 1) {
      return res.status(400).json({ error: 'Nível da tropa inválido' });
    }
    if (requestedLevel > maxLevel) {
      return res.status(400).json({
        error: `Tropa nível ${requestedLevel} requer barraco nível ${(requestedLevel - 1) * 10 + 1} ou mais (você tem ${barracoLevel}).`,
      });
    }

    const completedChanged = updateCompletedTrainingSlots(player);

    const ctAlreadyOccupied = gang.trainingSlots.some(
      (slot) => String(slot.ctKey) === String(ctKey)
    );
    if (ctAlreadyOccupied) {
      if (completedChanged) {
        clearTrainingLockOnDocument(player);
        trainingLockId = null;
        await saveAndBroadcastTrainingState(player);
      }
      return res.status(409).json({ error: 'Este CT já possui um treinamento pendente' });
    }
    if (gang.trainingSlots.length >= 4) {
      if (completedChanged) {
        clearTrainingLockOnDocument(player);
        trainingLockId = null;
        await saveAndBroadcastTrainingState(player);
      }
      return res.status(409).json({ error: 'Todos os CTs já estão ocupados' });
    }

    const { quantity, durationMs, cost, level } = calculateTrainingConfig(
      player,
      String(troopType),
      requestedLevel
    );

    const dirtyMoney = Number(player.balances?.dirtyMoney || 0);
    if (dirtyMoney < cost) {
      if (completedChanged) {
        clearTrainingLockOnDocument(player);
        trainingLockId = null;
        await saveAndBroadcastTrainingState(player);
      }
      return res.status(400).json({
        error: `Dinheiro sujo insuficiente. Precisa de ${cost.toLocaleString('pt-BR')}.`,
      });
    }

    const startedAt = Date.now();
    const slot = {
      id: randomUUID(),
      ctKey: String(ctKey),
      troopType: String(troopType),
      troopLevel: level,
      quantity,
      startedAt,
      endsAt: startedAt + durationMs,
      status: 'training',
      cost,
    };

    player.balances.dirtyMoney = Math.max(0, dirtyMoney - cost);
    gang.trainingSlots.push(slot);
    clearTrainingLockOnDocument(player);
    trainingLockId = null;

    const payload = await saveAndBroadcastTrainingState(player);
    return res.status(201).json({
      ...payload,
      message: `Treinamento de ${quantity}× ${troopType} nível ${level} iniciado`,
    });
  } catch (error) {
    console.error('Erro em startTraining:', error);
    return res.status(500).json({ error: 'Erro ao iniciar treinamento' });
  } finally {
    if (trainingLockId && lockedPlayerId) {
      await releaseTrainingLock(lockedPlayerId, trainingLockId).catch(() => {});
    }
  }
}

export async function collectTraining(req, res) {
  let trainingLockId = null;
  let lockedPlayerId = null;

  try {
    const initialPlayer = req.player;
    if (!initialPlayer?._id) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { slotId } = req.body || {};

    if (!slotId) {
      return res.status(400).json({ error: 'slotId é obrigatório' });
    }

    trainingLockId = randomUUID();
    lockedPlayerId = initialPlayer._id;
    const player = await acquireTrainingLock(lockedPlayerId, trainingLockId);
    if (!player) {
      trainingLockId = null;
      return res.status(409).json({
        error: 'Outra coleta/treinamento está sendo processada. Tente novamente em instantes.',
        reason: 'training_operation_in_progress',
      });
    }

    const gang = ensureGang(player);
    updateCompletedTrainingSlots(player);

    const slotIndex = gang.trainingSlots.findIndex(
      (slot) => String(slot.id) === String(slotId)
    );
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

    const level = Math.max(1, Math.min(10, Math.floor(Number(slot.troopLevel) || 1)));
    const collectedAt = new Date().toISOString();
    const quantity = Math.max(1, Math.floor(Number(slot.quantity || 1)));

    const newMembers = Array.from({ length: quantity }, (_, index) => ({
      id: `member_${player._id}_${Date.now()}_${index}_${randomUUID()}`,
      type: troopType,
      level,
      status: 'ativo',
      recruitedAt: collectedAt,
      trainingEndsAt: null,
      injuryEndsAt: null,
    }));

    gang.members.push(...newMembers);
    gang.trainingSlots.splice(slotIndex, 1);
    clearTrainingLockOnDocument(player);
    trainingLockId = null;

    const payload = await saveAndBroadcastTrainingState(player);
    return res.json({
      ...payload,
      message: `${quantity} ${troopType} nível ${level} coletados`,
      createdMembers: newMembers,
    });
  } catch (error) {
    console.error('Erro em collectTraining:', error);
    return res.status(500).json({ error: 'Erro ao coletar treinamento' });
  } finally {
    if (trainingLockId && lockedPlayerId) {
      await releaseTrainingLock(lockedPlayerId, trainingLockId).catch(() => {});
    }
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
 * Preview de custo/qtd/duração para o frontend mostrar enquanto o jogador
 * desliza o slider de nível. Não muta o estado.
 *
 * GET /api/training/preview?troopType=muralha&troopLevel=4
 */
export async function getTrainingPreview(req, res) {
  try {
    const player = req.player;
    const troopType = String(req.query?.troopType || '');
    const troopLevel = Math.floor(Number(req.query?.troopLevel) || 1);

    const barracoLevel = getBarracoLevel(player);
    const maxLevel = getMaxTroopLevel(barracoLevel);

    if (!VALID_MEMBER_TYPES.includes(troopType)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    if (troopLevel < 1 || troopLevel > maxLevel) {
      return res.json({
        ok: true,
        unlocked: false,
        barracoLevel,
        maxLevel,
        level: troopLevel,
        message:
          troopLevel > maxLevel
            ? `Requer barraco nível ${(troopLevel - 1) * 10 + 1} ou mais`
            : 'Nível inválido',
      });
    }

    const config = calculateTrainingConfig(player, troopType, troopLevel);

    return res.json({
      ok: true,
      unlocked: true,
      barracoLevel,
      maxLevel,
      troopType,
      level: config.level,
      quantity: config.quantity,
      cost: config.cost,
      durationMs: config.durationMs,
      durationMinutes: config.durationMinutes,
    });
  } catch (error) {
    console.error('Erro em getTrainingPreview:', error);
    return res.status(500).json({ error: 'Erro ao calcular preview' });
  }
}

export async function persistTrainingState(req, res) {
  return getGangStatus(req, res);
}