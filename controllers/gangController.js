// controllers/gangController.js
// Sistema oficial de gangue baseado em Player.gang.
// Não usa GangWar. GangWar fica apenas como legado isolado.

import { randomUUID } from 'crypto';
import Player from '../models/Player.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { mergePlayerState, recalculateGangStats } from '../utils/playerMapper.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import {
  applyBarracoGangStatSourceToList,
  buildGangStatSnapshot,
  removeGangStatSource,
  upsertGangStatSource,
} from '../services/gangStatisticsService.js';

const VALID_MEMBER_TYPES = ['capanga', 'frente', 'executor', 'assassino', 'muralha', 'certeiro', 'motorista', 'nitro'];
const VALID_FORMATIONS = ['pressao_total', 'linha_fechada', 'bote_certo', 'cerco', 'saque_rapido'];

function toPlain(value) {
  return value && typeof value.toObject === 'function' ? value.toObject() : value;
}

function getBarracoLevel(player) {
  return Math.max(1, Math.floor(Number(player?.niveis?.barracoLevel || 1)));
}

function getGangLevel(player) {
  return Math.max(1, Math.min(10, Math.floor((getBarracoLevel(player) - 1) / 10) + 1));
}

function getMaxTroopLevel(player) {
  return Math.max(1, Math.min(10, Math.floor(getBarracoLevel(player) / 10) + 1));
}

function ensurePlayerGang(player) {
  if (!player.gang || typeof player.gang !== 'object') player.gang = {};
  if (!Array.isArray(player.gang.members)) player.gang.members = [];
  if (!Array.isArray(player.gang.trainingSlots)) player.gang.trainingSlots = [];
  if (!Array.isArray(player.gang.statSources)) player.gang.statSources = [];
  if (!VALID_FORMATIONS.includes(String(player.gang.formation || ''))) {
    player.gang.formation = 'pressao_total';
  }
  return player.gang;
}

function normalizeMember(member = {}) {
  const type = VALID_MEMBER_TYPES.includes(String(member.type)) ? String(member.type) : 'capanga';
  const status = ['ativo', 'ferido', 'morto', 'treinando', 'marchando'].includes(String(member.status))
    ? String(member.status)
    : 'ativo';
  return {
    ...toPlain(member),
    id: String(member.id || `member_${Date.now()}_${randomUUID()}`),
    type,
    level: Math.max(1, Math.min(10, Math.floor(Number(member.level || 1)))),
    status,
    recruitedAt: member.recruitedAt || new Date().toISOString(),
    trainingEndsAt: member.trainingEndsAt || null,
    injuryEndsAt: member.injuryEndsAt || null,
    activeAttackId: member.activeAttackId || null,
    marchingUntil: member.marchingUntil || null,
  };
}

function normalizeTrainingSlot(slot = {}) {
  return {
    ...toPlain(slot),
    id: String(slot.id || `slot_${Date.now()}_${randomUUID()}`),
    ctKey: String(slot.ctKey || 'ct_nw'),
    troopType: VALID_MEMBER_TYPES.includes(String(slot.troopType)) ? String(slot.troopType) : 'capanga',
    troopLevel: Math.max(1, Math.min(10, Math.floor(Number(slot.troopLevel || 1)))),
    quantity: Math.max(1, Math.floor(Number(slot.quantity || 1))),
    startedAt: Number(slot.startedAt || Date.now()),
    endsAt: Number(slot.endsAt || Date.now()),
    status: ['training', 'completed'].includes(String(slot.status))
      ? String(slot.status)
      : (Date.now() >= Number(slot.endsAt || 0) ? 'completed' : 'training'),
    cost: Math.max(0, Math.floor(Number(slot.cost || 0))),
  };
}

function countByType(members, predicate = () => true) {
  const result = Object.fromEntries(VALID_MEMBER_TYPES.map((type) => [type, 0]));
  for (const member of members || []) {
    if (!predicate(member)) continue;
    const type = VALID_MEMBER_TYPES.includes(String(member.type)) ? String(member.type) : 'capanga';
    result[type] = (result[type] || 0) + 1;
  }
  return result;
}

function buildTroopSummary(members) {
  const list = Array.isArray(members) ? members : [];
  return {
    totalMembers: list.filter((m) => m.status !== 'morto').length,
    activeMembers: list.filter((m) => m.status === 'ativo').length,
    injuredMembers: list.filter((m) => m.status === 'ferido').length,
    deadMembers: list.filter((m) => m.status === 'morto').length,
    trainingMembers: list.filter((m) => m.status === 'treinando').length,
    byType: countByType(list, (m) => m.status !== 'morto'),
    activeByType: countByType(list, (m) => m.status === 'ativo'),
  };
}

function getTrainingConfig(player) {
  const barracoLevel = getBarracoLevel(player);
  return {
    quantityPerOrder: Math.max(1, barracoLevel * 10),
    durationSeconds: Math.max(10, barracoLevel * 120),
    slots: 4,
  };
}

function preparePlayerGang(player) {
  const gang = ensurePlayerGang(player);
  gang.members = (gang.members || []).map(normalizeMember);
  gang.trainingSlots = (gang.trainingSlots || []).map(normalizeTrainingSlot);
  gang.statSources = applyBarracoGangStatSourceToList(gang.statSources || [], getBarracoLevel(player));
  gang.stats = recalculateGangStats(gang.members);
  gang.statSnapshot = buildGangStatSnapshot(gang.members, gang.statSources);
  gang.updatedAtIso = new Date().toISOString();
  player.markModified('gang');
  return gang;
}

function buildGangEnvelope(player) {
  const gang = preparePlayerGang(player);
  const plainGang = toPlain(gang);
  const members = Array.isArray(plainGang.members) ? plainGang.members : [];
  const trainingSlots = Array.isArray(plainGang.trainingSlots) ? plainGang.trainingSlots : [];
  const statSources = Array.isArray(plainGang.statSources) ? plainGang.statSources : [];
  const statSnapshot = plainGang.statSnapshot || buildGangStatSnapshot(members, statSources);

  return {
    ok: true,
    success: true,
    gang: {
      members,
      trainingSlots,
      trainingJobs: trainingSlots,
      formation: plainGang.formation || 'pressao_total',
      statSources,
      statSnapshot,
      stats: plainGang.stats || recalculateGangStats(members),
      ct: {
        level: getGangLevel(player),
        maxLevel: 10,
        trainingSlots: 4,
        recoveryBonusPercent: 0,
        trainingSpeedBonusPercent: 0,
        gangCapacityBonus: 0,
      },
      maxMembers: Math.max(100, getBarracoLevel(player) * 100),
      gangLevel: getGangLevel(player),
      dailyUpkeep: {
        totalDirtyMoneyCost: 0,
        byType: Object.fromEntries(VALID_MEMBER_TYPES.map((type) => [type, 0])),
      },
      trainingConfig: getTrainingConfig(player),
      troopSummary: buildTroopSummary(members),
    },
    trainingSlots,
    statSources,
    statSnapshot,
    playerBalances: player.balances,
    balances: player.balances,
    player: mergePlayerState(toPlain(player)),
  };
}

function emitGangState(player, payload = null) {
  const safePayload = payload || buildGangEnvelope(player);
  emitToPlayer(String(player._id), 'playerUpdate', { player: safePayload.player });
  emitToPlayer(String(player._id), 'gangUpdate', {
    gang: safePayload.gang,
    player: safePayload.player,
  });
}

export async function getMyGang(req, res) {
  try {
    const player = req.player;
    const payload = buildGangEnvelope(player);
    await player.save();
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /api/gang/me:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao carregar gangue' });
  }
}

export async function getGangStats(req, res) {
  try {
    const player = req.player;
    const payload = buildGangEnvelope(player);
    await player.save();
    return res.json({
      statSources: payload.statSources,
      statSnapshot: payload.statSnapshot,
      gang: payload.gang,
      player: payload.player,
    });
  } catch (error) {
    console.error('Erro em /api/gang/stats:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao carregar estatísticas da gangue' });
  }
}

export async function createOrUpdateGangStatSource(req, res) {
  try {
    const player = req.player;
    ensurePlayerGang(player);
    const { source, statSnapshot } = upsertGangStatSource(player, req.body || {});
    bumpVersion(player);
    const payload = buildGangEnvelope(player);
    await player.save();
    emitGangState(player, payload);
    return res.json({
      source,
      statSources: payload.statSources,
      statSnapshot: statSnapshot || payload.statSnapshot,
      gang: payload.gang,
      player: payload.player,
    });
  } catch (error) {
    console.error('Erro em /api/gang/stats/source:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao salvar fonte de estatística' });
  }
}

export async function deleteGangStatSource(req, res) {
  try {
    const player = req.player;
    ensurePlayerGang(player);
    const { removed, statSnapshot } = removeGangStatSource(player, req.params.sourceId);
    bumpVersion(player);
    const payload = buildGangEnvelope(player);
    await player.save();
    emitGangState(player, payload);
    return res.json({
      removed,
      statSources: payload.statSources,
      statSnapshot: statSnapshot || payload.statSnapshot,
      gang: payload.gang,
      player: payload.player,
    });
  } catch (error) {
    console.error('Erro em /api/gang/stats/source/:sourceId:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao remover fonte de estatística' });
  }
}

export async function setGangFormationOfficial(req, res) {
  try {
    const formation = String(req.body?.formation || '');
    if (!VALID_FORMATIONS.includes(formation)) {
      return res.status(400).json({ error: 'Formação inválida' });
    }

    const player = req.player;
    const gang = ensurePlayerGang(player);
    gang.formation = formation;
    bumpVersion(player);
    const payload = buildGangEnvelope(player);
    await player.save();
    emitGangState(player, payload);
    return res.json(payload);
  } catch (error) {
    console.error('Erro em /api/gang/formation/set:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao definir formação' });
  }
}

export async function recruitGangMemberOfficial(req, res) {
  try {
    const type = String(req.body?.type || '');
    if (!VALID_MEMBER_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Tipo de membro inválido' });
    }
    const player = req.player;
    if (player?.punishments?.dirtyMoneyBlocked) {
      return res.status(423).json({ error: 'Dinheiro sujo bloqueado. Recrutamento indisponível.' });
    }

    const gang = ensurePlayerGang(player);
    const nowIso = new Date().toISOString();
    gang.members.push({
      id: `member_${player._id}_${Date.now()}_${randomUUID()}`,
      type,
      level: 1,
      status: 'ativo',
      recruitedAt: nowIso,
      trainingEndsAt: null,
      injuryEndsAt: null,
      activeAttackId: null,
      marchingUntil: null,
    });
    bumpVersion(player);
    const payload = buildGangEnvelope(player);
    await player.save();
    emitGangState(player, payload);
    return res.status(201).json(payload);
  } catch (error) {
    console.error('Erro em /api/gang/recruit:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao recrutar membro' });
  }
}

export async function payGangMaintenanceOfficial(req, res) {
  try {
    const player = req.player;
    const payload = buildGangEnvelope(player);
    await player.save();
    return res.json({ ...payload, message: 'Manutenção conferida.' });
  } catch (error) {
    console.error('Erro em /api/gang/maintenance/pay:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao pagar manutenção' });
  }
}

export async function upgradeGangCtOfficial(req, res) {
  try {
    const player = req.player;
    const payload = buildGangEnvelope(player);
    await player.save();
    return res.json({ ...payload, message: 'CTs oficiais evoluem pelo nível do barraco.' });
  } catch (error) {
    console.error('Erro em /api/gang/ct/upgrade:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao consultar CT' });
  }
}

export async function applyGangBattleLossesOfficial(req, res) {
  try {
    // O motor de batalha oficial já aplica baixas diretamente em Player.gang.
    // Este endpoint existe apenas para compatibilidade de chamada manual, sem GangWar.
    const player = req.player;
    const payload = buildGangEnvelope(player);
    await player.save();
    return res.json({ ...payload, message: 'Baixas conferidas no Player.gang oficial.' });
  } catch (error) {
    console.error('Erro em /api/gang/apply-battle-losses:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao conferir baixas' });
  }
}
