import mongoose from 'mongoose';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
import ChatMessage from '../models/ChatMessage.js';
import AzideiaTarget from '../models/AzideiaTarget.js';
import AzideiaMission from '../models/AzideiaMission.js';
import AzideiaRewardBatch from '../models/AzideiaRewardBatch.js';
import { AZIDEIA_X9, AZIDEIA_CORRERIA, AZIDEIA_TARGETS } from '../data/azideiaCatalog.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { broadcastToAll, emitToPlayer, emitToPlayers } from '../services/socketEmitter.js';

const GRID_WIDTH = 120;
const GRID_HEIGHT = 120;
const MAX_PARALLEL_AZIDEIA_CONVOYS = 3;
const PLAYER_SPACE_WIDTH = 6;
const PLAYER_SPACE_HEIGHT = 6;
const X9_SPAWN_PADDING_TILES = 1;
const X9_STALE_RESERVATION_MS = 90 * 1000;
const AZIDEIA_MISSION_GRACE_MS = 2500;
const AZIDEIA_RESCUE_OVERDUE_MS = 45 * 1000;

function availableTargetQuery(type) {
  return {
    type,
    active: true,
    $or: [
      { reservedByPlayerId: null },
      { reservedByPlayerId: { $exists: false } },
      { reservedByPlayerId: '' },
    ],
  };
}

function activeTargetQuery(type) {
  return { type, active: true };
}

const AVAILABLE_X9_QUERY = availableTargetQuery('x9');
const AVAILABLE_CORRERIA_QUERY = availableTargetQuery('correria');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function clampTile(value) {
  return Math.max(0, Math.min(119, Math.floor(toNumber(value, 0))));
}

function addOccupiedRect(set, startX, startY, width = 1, height = 1, padding = 0) {
  const minX = Math.max(0, Math.floor(toNumber(startX, 0)) - padding);
  const minY = Math.max(0, Math.floor(toNumber(startY, 0)) - padding);
  const maxX = Math.min(GRID_WIDTH - 1, Math.floor(toNumber(startX, 0)) + Math.max(1, width) - 1 + padding);
  const maxY = Math.min(GRID_HEIGHT - 1, Math.floor(toNumber(startY, 0)) + Math.max(1, height) - 1 + padding);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      set.add(`${x},${y}`);
    }
  }
}

function getPlayerSpaceCenterTile(tileX, tileY) {
  return {
    tileX: clampTile(toNumber(tileX, 0) + Math.floor(PLAYER_SPACE_WIDTH / 2)),
    tileY: clampTile(toNumber(tileY, 0) + Math.floor(PLAYER_SPACE_HEIGHT / 2)),
  };
}

function ensureConvoyAccelerators(player) {
  const current = player.convoyAccelerators || {};
  player.convoyAccelerators = {
    twoX: Math.max(0, Math.floor(toNumber(current.twoX, 0))),
  };
  return player.convoyAccelerators;
}

function ensureAzideiaDaily(player) {
  const key = todayKey();
  const current = player.azideiaDaily || {};
  if (current.date !== key) {
    player.azideiaDaily = {
      date: key,
      x9Kills: 0,
      correriaNegotiations: 0,
      correriaFactionCorreReceived: 0,
    };
  } else {
    player.azideiaDaily = {
      date: key,
      x9Kills: Math.max(0, Math.floor(toNumber(current.x9Kills, 0))),
      correriaNegotiations: Math.max(0, Math.floor(toNumber(current.correriaNegotiations, 0))),
      correriaFactionCorreReceived: Math.max(0, Math.floor(toNumber(current.correriaFactionCorreReceived, 0))),
    };
  }
  return player.azideiaDaily;
}

function emitPlayerUpdate(player) {
  const playerId = String(player?._id || '');
  if (!playerId) return;
  const plain = typeof player.toObject === 'function' ? player.toObject() : player;
  emitToPlayer(playerId, 'playerUpdate', { player: mergePlayerState(plain) });
}

function getTargetConfig(type = 'x9') {
  return AZIDEIA_TARGETS[type] || AZIDEIA_X9;
}

function normalizeTarget(target) {
  const type = target.type || 'x9';
  const config = getTargetConfig(type);
  return {
    id: String(target._id),
    type,
    name: target.name || config.name,
    modelUrl: target.modelUrl || config.modelUrl,
    tileX: clampTile(target.tileX),
    tileY: clampTile(target.tileY),
    costDirtyMoney: config.costDirtyMoney,
    rewardType: config.rewardType,
    rewardQuantity: config.rewardQuantity,
    reserved: Boolean(target.reservedByPlayerId),
  };
}

function normalizeMessage(message) {
  return {
    id: String(message._id),
    channel: message.channel,
    senderId: message.senderId,
    senderName: message.senderName,
    recipientId: message.recipientId ?? null,
    recipientName: message.recipientName ?? null,
    factionId: message.factionId ?? null,
    subject: message.subject ?? null,
    body: message.body,
    createdAt: message.createdAt,
    read: message.read ?? false,
    system: message.system ?? false,
    messageType: message.messageType ?? 'text',
    metadata: message.metadata ?? {},
  };
}

function emitAzideiaMapChanged(reason, extra = {}) {
  const payload = {
    reason,
    atIso: new Date().toISOString(),
    ...extra,
  };
  broadcastToAll('azideia:targetChanged', payload);
  // Compatibilidade com a GamePage publicada em versões anteriores.
  broadcastToAll('azideia:x9Changed', payload);
}

function emitAzideiaMissionChanged(reason, mission) {
  broadcastToAll('azideia:missionChanged', {
    reason,
    atIso: new Date().toISOString(),
    mission: normalizeMission(mission),
  });
}

function normalizeMission(mission) {
  if (!mission) return null;
  const targetType = mission.targetType || 'x9';
  const config = getTargetConfig(targetType);
  return {
    missionId: String(mission._id),
    status: mission.status,
    targetId: String(mission.targetId),
    targetType,
    targetName: mission.targetName || config.name,
    targetModelUrl: mission.targetModelUrl || config.modelUrl,
    targetTileX: clampTile(mission.targetTileX),
    targetTileY: clampTile(mission.targetTileY),
    originTileX: clampTile(mission.originTileX),
    originTileY: clampTile(mission.originTileY),
    routeTiles: mission.routeTiles || [],
    returnRouteTiles: mission.returnRouteTiles || [],
    travelDurationMs: Math.max(0, Math.floor(toNumber(mission.travelDurationMs, 0))),
    returnDurationMs: Math.max(0, Math.floor(toNumber(mission.returnDurationMs, 0))),
    launchedAtIso: mission.launchedAtIso,
    arriveAtIso: mission.arriveAtIso,
    returnAtIso: mission.returnAtIso,
    costDirtyMoney: Math.max(0, Math.floor(toNumber(mission.costDirtyMoney, 0))),
    rewardType: mission.rewardType || config.rewardType,
    rewardQuantity: Math.max(0, Math.floor(toNumber(mission.rewardQuantity, config.rewardQuantity))),
  };
}

function buildDiagonalRoute(fromX, fromY, toX, toY) {
  const route = [];
  let x = clampTile(fromX);
  let y = clampTile(fromY);
  const tx = clampTile(toX);
  const ty = clampTile(toY);
  route.push({ tileX: x, tileY: y });

  let safety = 0;
  while ((x !== tx || y !== ty) && safety < 300) {
    if (x < tx) x += 1;
    else if (x > tx) x -= 1;

    if (y < ty) y += 1;
    else if (y > ty) y -= 1;

    route.push({ tileX: x, tileY: y });
    safety += 1;
  }

  return route;
}

function reverseRoute(routeTiles = []) {
  return [...routeTiles].reverse().map((step) => ({ tileX: clampTile(step.tileX), tileY: clampTile(step.tileY) }));
}

function getAzideiaTravelDuration(routeTiles, player) {
  const tileCount = Math.max(1, (Array.isArray(routeTiles) ? routeTiles.length : 1) - 1);
  const barracoLevel = Math.max(1, Math.floor(toNumber(player?.niveis?.barracoLevel, 1)));
  const levelSpeedMultiplier = 1 + (barracoLevel - 1) * 0.025;
  const msPerTile = Math.max(180, Math.round(520 / levelSpeedMultiplier));
  return Math.max(1400, Math.min(18000, tileCount * msPerTile));
}

function releaseAzideiaGangMember(player, mission) {
  let changed = false;
  if (!Array.isArray(player?.gang?.members)) return false;

  for (const member of player.gang.members) {
    if (String(member?.activeAttackId || '') === `azideia:${mission._id}`) {
      member.status = 'ativo';
      member.activeAttackId = null;
      member.marchingUntil = null;
      changed = true;
    }
  }

  return changed;
}

async function resolveAzideiaMissionArrival({ player, mission, nowMs }) {
  if (!mission || mission.status !== 'travelling') return { changedPlayer: false, changedMission: false, factionReward: null };

  const arriveAtMs = Date.parse(mission.arriveAtIso || '') || 0;
  if (arriveAtMs && nowMs + AZIDEIA_MISSION_GRACE_MS < arriveAtMs) {
    return { changedPlayer: false, changedMission: false, factionReward: null };
  }

  const targetType = mission.targetType || 'x9';
  const target = await AzideiaTarget.findOne({
    _id: mission.targetId,
    type: targetType,
    $or: [
      { reservedByMissionId: String(mission._id) },
      { reservedByMissionId: { $exists: false } },
      { reservedByMissionId: null },
      { reservedByMissionId: '' },
    ],
  });

  if (target && target.active) {
    target.active = false;
    target.reservedByPlayerId = null;
    target.reservedByMissionId = null;
    target.reservedAt = null;
    target.killedByPlayerId = String(player._id);
    target.killedByPlayerName = String(player.name || 'Jogador');
    target.killedAt = new Date(nowMs).toISOString();
    await target.save();
    emitAzideiaMapChanged(targetType === 'correria' ? 'correria_negotiated' : 'x9_killed', {
      targetId: String(target._id),
      missionId: String(mission._id),
      targetType,
    });
  }

  const daily = ensureAzideiaDaily(player);
  let factionReward = null;

  if (!mission.rewardGrantedAtIso) {
    if (targetType === 'correria') {
      daily.correriaNegotiations += 1;
    } else {
      daily.x9Kills += 1;
    }

    try {
      factionReward = targetType === 'correria'
        ? await grantCorreriaRewards({ player, mission })
        : await grantAzideiaRewards({ player, mission });
    } catch (rewardError) {
      // A missão e a reposição do mapa nunca podem travar porque o lote de
      // facção/chat falhou. O jogador recebe a recompensa imediata e o comboio
      // segue para retorno; o erro fica no log para auditoria.
      console.error('[AZIDEIA_REWARD_NON_BLOCKING]', rewardError);
    }
  }

  mission.status = 'returning';
  mission.arrivedAtIso = mission.arrivedAtIso || new Date(nowMs).toISOString();
  mission.rewardGrantedAtIso = mission.rewardGrantedAtIso || new Date(nowMs).toISOString();

  return { changedPlayer: true, changedMission: true, factionReward };
}

async function resolveAzideiaMissionReturn({ player, mission, nowMs, force = false }) {
  if (!mission || mission.status === 'completed' || mission.status === 'cancelled') {
    return { changedPlayer: false, changedMission: false };
  }

  const returnAtMs = Date.parse(mission.returnAtIso || '') || 0;
  if (!force && returnAtMs && nowMs + 1500 < returnAtMs) {
    return { changedPlayer: false, changedMission: false };
  }

  mission.status = 'completed';
  mission.completedAtIso = mission.completedAtIso || new Date(nowMs).toISOString();

  const changedPlayer = releaseAzideiaGangMember(player, mission);
  return { changedPlayer, changedMission: true };
}

async function reconcileAzideiaMissionsForPlayer(player) {
  if (!player?._id) return { changedPlayer: false, changedMissionCount: 0 };

  const nowMs = Date.now();
  const missions = await AzideiaMission.find({
    playerId: String(player._id),
    status: { $in: ['travelling', 'returning'] },
    $or: [
      { arriveAtIso: { $lte: new Date(nowMs + AZIDEIA_MISSION_GRACE_MS).toISOString() } },
      { returnAtIso: { $lte: new Date(nowMs + AZIDEIA_MISSION_GRACE_MS).toISOString() } },
      { updatedAt: { $lte: new Date(nowMs - AZIDEIA_RESCUE_OVERDUE_MS) } },
    ],
  }).sort({ createdAt: 1 });

  let changedPlayer = false;
  let changedMissionCount = 0;

  for (const mission of missions) {
    let missionChanged = false;

    try {
      if (mission.status === 'travelling') {
        const arrival = await resolveAzideiaMissionArrival({ player, mission, nowMs });
        changedPlayer = changedPlayer || arrival.changedPlayer;
        missionChanged = missionChanged || arrival.changedMission;
      }

      if (mission.status === 'returning') {
        const returned = await resolveAzideiaMissionReturn({ player, mission, nowMs });
        changedPlayer = changedPlayer || returned.changedPlayer;
        missionChanged = missionChanged || returned.changedMission;
      }

      if (missionChanged) {
        changedMissionCount += 1;
        await mission.save();
      }
    } catch (missionError) {
      console.error('[AZIDEIA_MISSION_RECONCILE_NON_BLOCKING]', {
        missionId: String(mission._id),
        status: mission.status,
        error: missionError,
      });
    }
  }

  if (changedPlayer) {
    if (typeof player.markModified === 'function') {
      player.markModified('gang');
      player.markModified('azideiaDaily');
      player.markModified('convoyAccelerators');
      player.markModified('balances');
    }
    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);
  }

  await ensureActiveAzideiaTargets();

  return { changedPlayer, changedMissionCount };
}

function getActiveGangMembers(player) {
  return Array.isArray(player?.gang?.members)
    ? player.gang.members.filter((member) => member?.status === 'ativo')
    : [];
}

async function getActiveAzideiaMissionCounts(playerId) {
  const [total, travelling, travellingX9, travellingCorreria] = await Promise.all([
    AzideiaMission.countDocuments({ playerId: String(playerId), status: { $in: ['travelling', 'returning'] } }),
    AzideiaMission.countDocuments({ playerId: String(playerId), status: 'travelling' }),
    AzideiaMission.countDocuments({ playerId: String(playerId), status: 'travelling', targetType: 'x9' }),
    AzideiaMission.countDocuments({ playerId: String(playerId), status: 'travelling', targetType: 'correria' }),
  ]);
  return { total, travelling, travellingX9, travellingCorreria };
}

async function usedTiles() {
  const activeTargets = await AzideiaTarget.find({ active: true }).select('tileX tileY').lean();
  const players = await Player.find({}, { 'mapPosition.tileX': 1, 'mapPosition.tileY': 1 }).lean();
  const set = new Set();

  for (const target of activeTargets) {
    addOccupiedRect(set, target.tileX, target.tileY, 1, 1, X9_SPAWN_PADDING_TILES);
  }

  for (const player of players) {
    if (!player.mapPosition) continue;
    addOccupiedRect(
      set,
      player.mapPosition.tileX,
      player.mapPosition.tileY,
      PLAYER_SPACE_WIDTH,
      PLAYER_SPACE_HEIGHT,
      X9_SPAWN_PADDING_TILES,
    );
  }

  return set;
}

function pickFreeX9Tile(used) {
  for (let attempt = 0; attempt < 350; attempt += 1) {
    const tileX = Math.floor(Math.random() * GRID_WIDTH);
    const tileY = Math.floor(Math.random() * GRID_HEIGHT);
    const key = `${tileX},${tileY}`;
    if (!used.has(key)) {
      addOccupiedRect(used, tileX, tileY, 1, 1, X9_SPAWN_PADDING_TILES);
      return { tileX, tileY };
    }
  }

  for (let tileX = 0; tileX < GRID_WIDTH; tileX += 1) {
    for (let tileY = 0; tileY < GRID_HEIGHT; tileY += 1) {
      const key = `${tileX},${tileY}`;
      if (!used.has(key)) {
        addOccupiedRect(used, tileX, tileY, 1, 1, X9_SPAWN_PADDING_TILES);
        return { tileX, tileY };
      }
    }
  }

  return { tileX: 0, tileY: 0 };
}

async function createRandomAzideiaTarget(type = 'x9', occupied = null) {
  const config = getTargetConfig(type);
  const used = occupied || await usedTiles();
  const { tileX, tileY } = pickFreeX9Tile(used);

  return AzideiaTarget.create({
    type,
    name: config.name,
    modelUrl: config.modelUrl,
    tileX,
    tileY,
    active: true,
    reservedByPlayerId: null,
    reservedByMissionId: null,
    reservedAt: null,
    spawnedAt: new Date().toISOString(),
  });
}

async function createRandomX9Target(occupied = null) {
  return createRandomAzideiaTarget('x9', occupied);
}

async function createRandomCorreriaTarget(occupied = null) {
  return createRandomAzideiaTarget('correria', occupied);
}

async function cleanupStaleX9Reservations() {
  const staleIso = new Date(Date.now() - X9_STALE_RESERVATION_MS).toISOString();
  const reservedTargets = await AzideiaTarget.find({
    type: { $in: ['x9', 'correria'] },
    active: true,
    reservedByPlayerId: { $nin: [null, ''] },
    $or: [
      { reservedAt: { $lte: staleIso } },
      { reservedAt: null },
      { reservedAt: { $exists: false } },
    ],
  });

  let cleaned = 0;

  for (const target of reservedTargets) {
    const missionId = String(target.reservedByMissionId || '').trim();
    const mission = mongoose.Types.ObjectId.isValid(missionId)
      ? await AzideiaMission.findById(missionId).select('status returnAtIso').lean()
      : null;

    // Se a missão ainda existe e está em andamento, mantém o alvo reservado.
    // Se a missão sumiu, completou, cancelou ou ficou sem id real, solta o alvo.
    if (mission && ['travelling', 'returning'].includes(mission.status)) {
      continue;
    }

    target.reservedByPlayerId = null;
    target.reservedByMissionId = null;
    target.reservedAt = null;
    await target.save();
    cleaned += 1;
  }

  return cleaned;
}

async function ensureActiveTargetPool(type, config) {
  // A regra de produto é mapa sempre vivo: 20 X9 e 10 Correria ativos no mapa.
  // Reservado por comboio ainda conta como ativo/visível até a chegada.
  // A reposição acontece quando o alvo realmente some do mapa (active=false).
  const activeCount = await AzideiaTarget.countDocuments(activeTargetQuery(type));
  const missing = Math.max(0, config.activeCount - activeCount);
  let created = 0;

  if (missing > 0) {
    const occupied = await usedTiles();
    for (let i = 0; i < missing; i += 1) {
      await createRandomAzideiaTarget(type, occupied);
      created += 1;
    }
  }

  return { created, activeCount: activeCount + created };
}

async function ensureActiveAzideiaTargets() {
  const cleaned = await cleanupStaleX9Reservations();
  const x9 = await ensureActiveTargetPool('x9', AZIDEIA_X9);
  const correria = await ensureActiveTargetPool('correria', AZIDEIA_CORRERIA);
  const created = x9.created + correria.created;

  if (cleaned > 0 || created > 0) {
    emitAzideiaMapChanged('ensure_target_pool', {
      cleaned,
      created,
      x9Created: x9.created,
      correriaCreated: correria.created,
      x9ActiveCount: AZIDEIA_X9.activeCount,
      correriaActiveCount: AZIDEIA_CORRERIA.activeCount,
    });
  }

  return { cleaned, created, x9Created: x9.created, correriaCreated: correria.created };
}

async function ensureActiveX9Targets() {
  return ensureActiveAzideiaTargets();
}


async function getVisibleTargetsForType(type, config, query) {
  // Exibe sempre os alvos ativos do tipo. Reservado continua visível, mas o
  // frontend bloqueia clique; disponível completa o mapa até o alvo ser removido.
  const reserved = await AzideiaTarget.find({
    type,
    active: true,
    reservedByPlayerId: { $exists: true, $nin: [null, ''] },
    reservedByMissionId: { $exists: true, $nin: [null, ''] },
  }).sort({ reservedAt: 1 }).limit(Math.max(10, config.activeCount)).lean();

  const reservedIds = new Set(reserved.map((target) => String(target._id)));
  const availableLimit = Math.max(0, config.activeCount - reserved.length);
  const available = availableLimit > 0
    ? await AzideiaTarget.find(query).sort({ createdAt: 1 }).limit(availableLimit).lean()
    : [];

  const byId = new Map();
  for (const target of [...reserved, ...available]) {
    byId.set(String(target._id), target);
  }

  // Se sobrou alvo disponível por overpop legado, não joga tudo no mapa; o pool
  // se estabiliza naturalmente conforme os alvos antigos forem eliminados.
  return Array.from(byId.values())
    .sort((a, b) => Number(reservedIds.has(String(b._id))) - Number(reservedIds.has(String(a._id))));
}

function buildDailyEnvelope(player, travellingReservations = 0, correriaTravellingReservations = 0) {
  const daily = ensureAzideiaDaily(player);
  const dailyKills = Math.max(0, Math.floor(toNumber(daily.x9Kills, 0)));
  const dailyCorreriaNegotiations = Math.max(0, Math.floor(toNumber(daily.correriaNegotiations, 0)));
  const reserved = Math.max(0, Math.floor(toNumber(travellingReservations, 0)));
  const correriaReserved = Math.max(0, Math.floor(toNumber(correriaTravellingReservations, 0)));
  return {
    dailyKills,
    dailyLimit: AZIDEIA_X9.dailyLimitPerPlayer,
    remainingToday: Math.max(0, AZIDEIA_X9.dailyLimitPerPlayer - dailyKills - reserved),
    dailyCorreriaNegotiations,
    correriaDailyLimit: AZIDEIA_CORRERIA.dailyLimitPerPlayer,
    correriaRemainingToday: Math.max(0, AZIDEIA_CORRERIA.dailyLimitPerPlayer - dailyCorreriaNegotiations - correriaReserved),
    correriaFactionReceivedToday: Math.max(0, Math.floor(toNumber(daily.correriaFactionCorreReceived, 0))),
    correriaFactionDailyLimit: AZIDEIA_CORRERIA.factionDailyRewardLimit,
  };
}

export async function getAzideiaTargets(req, res) {
  try {
    if (req.player) await reconcileAzideiaMissionsForPlayer(req.player);
    await ensureActiveAzideiaTargets();
    const [x9Targets, correriaTargets] = await Promise.all([
      getVisibleTargetsForType('x9', AZIDEIA_X9, AVAILABLE_X9_QUERY),
      getVisibleTargetsForType('correria', AZIDEIA_CORRERIA, AVAILABLE_CORRERIA_QUERY),
    ]);

    const activeCounts = await getActiveAzideiaMissionCounts(req.player._id);
    const daily = buildDailyEnvelope(req.player, activeCounts.travellingX9, activeCounts.travellingCorreria);
    return res.json({
      targets: [...x9Targets, ...correriaTargets].map(normalizeTarget),
      x9Targets: x9Targets.map(normalizeTarget),
      correriaTargets: correriaTargets.map(normalizeTarget),
      costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
      correriaCostDirtyMoney: AZIDEIA_CORRERIA.costDirtyMoney,
      activeAzideiaConvoys: activeCounts.total,
      maxParallelAzideiaConvoys: MAX_PARALLEL_AZIDEIA_CONVOYS,
      ...daily,
    });
  } catch (error) {
    console.error('[AZIDEIA_TARGETS]', error);
    return res.status(500).json({ error: 'Erro ao buscar Azidéias no mapa' });
  }
}

export async function getX9Targets(req, res) {
  try {
    if (req.player) await reconcileAzideiaMissionsForPlayer(req.player);
    await ensureActiveAzideiaTargets();
    const targets = await getVisibleTargetsForType('x9', AZIDEIA_X9, AVAILABLE_X9_QUERY);

    const activeCounts = await getActiveAzideiaMissionCounts(req.player._id);
    const daily = buildDailyEnvelope(req.player, activeCounts.travellingX9, activeCounts.travellingCorreria);
    return res.json({
      targets: targets.map(normalizeTarget),
      costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
      activeAzideiaConvoys: activeCounts.total,
      maxParallelAzideiaConvoys: MAX_PARALLEL_AZIDEIA_CONVOYS,
      ...daily,
    });
  } catch (error) {
    console.error('[AZIDEIA_X9_TARGETS]', error);
    return res.status(500).json({ error: 'Erro ao buscar X9 no mapa' });
  }
}

export async function getActiveAzideiaMissions(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    await reconcileAzideiaMissionsForPlayer(player);

    const missions = await AzideiaMission.find({
      playerId: String(player._id),
      status: { $in: ['travelling', 'returning'] },
    }).sort({ createdAt: 1 });

    return res.json({ missions: missions.map(normalizeMission) });
  } catch (error) {
    console.error('[AZIDEIA_ACTIVE_MISSIONS]', error);
    return res.status(500).json({ error: 'Erro ao buscar Azidéias ativas' });
  }
}

export async function attackX9(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const targetId = String(req.params?.targetId || req.body?.targetId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'X9 inválido', reason: 'invalid_target_id' });
    }

    await reconcileAzideiaMissionsForPlayer(player);

    const activeCounts = await getActiveAzideiaMissionCounts(player._id);
    const activeMembers = getActiveGangMembers(player);

    if (activeCounts.total >= MAX_PARALLEL_AZIDEIA_CONVOYS) {
      return res.status(429).json({
        error: 'Você já tem 3 comboios Azidéia em andamento.',
        reason: 'max_parallel_azideia_convoys',
        activeAzideiaConvoys: activeCounts.total,
        maxParallelAzideiaConvoys: MAX_PARALLEL_AZIDEIA_CONVOYS,
      });
    }

    if (activeMembers.length <= 0) {
      return res.status(400).json({
        error: 'Você precisa de pelo menos 1 membro ativo da gangue para enviar um comboio Azidéia.',
        reason: 'no_active_gang_member',
      });
    }

    const daily = ensureAzideiaDaily(player);
    if (daily.x9Kills + activeCounts.travellingX9 >= AZIDEIA_X9.dailyLimitPerPlayer) {
      return res.status(429).json({
        error: 'Limite diário de Azidéia atingido.',
        reason: 'daily_limit_reached',
        ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria),
      });
    }

    player.balances = player.balances || {};
    const dirtyMoney = toNumber(player.balances.dirtyMoney, 0);
    if (dirtyMoney < AZIDEIA_X9.costDirtyMoney) {
      return res.status(400).json({
        error: 'Dinheiro sujo insuficiente para lançar Azidéia.',
        reason: 'insufficient_dirty_money',
        costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
        currentDirtyMoney: dirtyMoney,
      });
    }

    const reservationKey = `pending:${String(player._id)}:${Date.now()}`;
    const target = await AzideiaTarget.findOneAndUpdate(
      {
        _id: targetId,
        type: 'x9',
        active: true,
        $or: [
          { reservedByPlayerId: null },
          { reservedByPlayerId: { $exists: false } },
          { reservedByPlayerId: '' },
        ],
      },
      {
        $set: {
          reservedByPlayerId: String(player._id),
          reservedByMissionId: reservationKey,
          reservedAt: new Date().toISOString(),
        },
      },
      { new: true },
    );

    if (!target) {
      await ensureActiveAzideiaTargets();
      return res.status(409).json({ error: 'Esse X9 já está na mira de outro comboio.', reason: 'target_already_reserved' });
    }

    const originTileX = clampTile(player.mapPosition?.tileX ?? 0);
    const originTileY = clampTile(player.mapPosition?.tileY ?? 0);
    const routeStart = getPlayerSpaceCenterTile(originTileX, originTileY);
    const routeTiles = buildDiagonalRoute(routeStart.tileX, routeStart.tileY, target.tileX, target.tileY);
    const returnRouteTiles = reverseRoute(routeTiles);
    const travelDurationMs = getAzideiaTravelDuration(routeTiles, player);
    const returnDurationMs = travelDurationMs;
    const launchedAt = Date.now();
    const arriveAtIso = new Date(launchedAt + travelDurationMs).toISOString();
    const returnAtIso = new Date(launchedAt + travelDurationMs + returnDurationMs).toISOString();
    const selectedMember = activeMembers[0];

    player.balances.dirtyMoney = Math.max(0, dirtyMoney - AZIDEIA_X9.costDirtyMoney);

    const mission = await AzideiaMission.create({
      playerId: String(player._id),
      playerName: String(player.name || 'Jogador'),
      factionId: player.factionId ? String(player.factionId) : null,
      targetId: String(target._id),
      targetType: 'x9',
      targetName: target.name || AZIDEIA_X9.name,
      targetModelUrl: target.modelUrl || AZIDEIA_X9.modelUrl,
      targetTileX: clampTile(target.tileX),
      targetTileY: clampTile(target.tileY),
      originTileX,
      originTileY,
      routeTiles,
      returnRouteTiles,
      travelDurationMs,
      returnDurationMs,
      costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
      rewardType: AZIDEIA_X9.rewardType,
      rewardQuantity: AZIDEIA_X9.rewardQuantity,
      selectedGangMemberId: selectedMember?.id || null,
      status: 'travelling',
      launchedAtIso: new Date(launchedAt).toISOString(),
      arriveAtIso,
      returnAtIso,
    });

    target.reservedByMissionId = String(mission._id);
    target.reservedAt = new Date(launchedAt).toISOString();
    await target.save();
    emitAzideiaMapChanged('x9_reserved', { targetId: String(target._id), missionId: String(mission._id), targetType: 'x9' });
    emitAzideiaMissionChanged('mission_started', mission);

    // Não cria X9 extra na reserva: o X9 continua visível até o comboio chegar.
    // A reposição é feita quando ele é eliminado (active=false).
    await ensureActiveAzideiaTargets();

    if (selectedMember) {
      selectedMember.status = 'marchando';
      selectedMember.activeAttackId = `azideia:${mission._id}`;
      selectedMember.marchingUntil = returnAtIso;
    }

    if (typeof player.markModified === 'function') {
      player.markModified('balances');
      player.markModified('gang');
      player.markModified('azideiaDaily');
    }

    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);

    return res.json({
      success: true,
      phase: 'travelling',
      ...normalizeMission(mission),
      targetId: String(target._id),
      targetType: 'x9',
      costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
      immediateReward: null,
      factionReward: null,
      activeAzideiaConvoys: activeCounts.total + 1,
      maxParallelAzideiaConvoys: MAX_PARALLEL_AZIDEIA_CONVOYS,
      ...buildDailyEnvelope(player, activeCounts.travellingX9 + 1, activeCounts.travellingCorreria),
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_ATTACK_X9]', error);
    return res.status(500).json({ error: 'Erro ao lançar Azidéia contra X9' });
  }
}

async function grantAzideiaRewards({ player, mission }) {
  const accelerators = ensureConvoyAccelerators(player);
  accelerators.twoX += AZIDEIA_X9.rewardQuantity;

  let factionReward = null;
  if (player.factionId) {
    const faction = await Faction.findOne({ id: String(player.factionId) });
    if (faction && Array.isArray(faction.members) && faction.members.length > 0) {
      const memberIds = Array.from(new Set(faction.members.map((member) => String(member.playerId)).filter(Boolean)));
      if (memberIds.length > 0) {
        const batch = await AzideiaRewardBatch.create({
          factionId: String(faction.id),
          rewardType: AZIDEIA_X9.rewardType,
          quantityPerMember: AZIDEIA_X9.rewardQuantity,
          memberIds,
          sourceTargetType: 'x9',
          sourceTargetId: String(mission.targetId),
          killerId: String(player._id),
          killerName: String(player.name || 'Jogador'),
        });

        mission.factionRewardBatchId = String(batch._id);
        factionReward = {
          factionId: String(faction.id),
          rewardType: AZIDEIA_X9.rewardType,
          quantityPerMember: AZIDEIA_X9.rewardQuantity,
          memberCount: memberIds.length,
          batchId: String(batch._id),
        };

        const message = await ChatMessage.create({
          channel: 'faccao',
          senderId: 'system:azideia',
          senderName: 'Azidéia',
          factionId: String(faction.id),
          body: `${player.name || 'Jogador'} eliminou um X9. A facção recebeu aceleradores para coletar.`,
          read: false,
          system: true,
          messageType: 'azideia_reward',
          metadata: {
            batchId: String(batch._id),
            targetType: 'x9',
            rewardType: AZIDEIA_X9.rewardType,
            quantityPerMember: AZIDEIA_X9.rewardQuantity,
            memberCount: memberIds.length,
            killerId: String(player._id),
            killerName: String(player.name || 'Jogador'),
            iconUrl: AZIDEIA_X9.iconUrl,
          },
        });

        emitToPlayers(memberIds, 'newChatMessage', () => normalizeMessage(message));
      }
    }
  }

  return factionReward;
}


function normalizeFactionRewardCap(value) {
  return Math.min(AZIDEIA_CORRERIA.factionDailyRewardLimit, Math.max(0, Math.floor(toNumber(value, 0))));
}

async function grantCorreriaRewards({ player, mission }) {
  // Recompensa imediata do jogador que negociou: +1 Corre.
  // Recompensa de facção: NÃO entra direto no saldo; vira lote coletável
  // pelo ícone Azidéia no chat da facção, com limite diário aplicado no claim.
  player.balances = player.balances || {};
  player.balances.corre = Math.max(0, Math.floor(toNumber(player.balances.corre, 0))) + AZIDEIA_CORRERIA.rewardQuantity;

  let factionReward = null;
  if (player.factionId) {
    const faction = await Faction.findOne({ id: String(player.factionId) });
    if (faction && Array.isArray(faction.members) && faction.members.length > 0) {
      const memberIds = Array.from(new Set(faction.members.map((member) => String(member.playerId)).filter(Boolean)));

      if (memberIds.length > 0) {
        const batch = await AzideiaRewardBatch.create({
          factionId: String(faction.id),
          rewardType: AZIDEIA_CORRERIA.rewardType,
          quantityPerMember: AZIDEIA_CORRERIA.rewardQuantity,
          memberIds,
          sourceTargetType: 'correria',
          sourceTargetId: String(mission.targetId),
          killerId: String(player._id),
          killerName: String(player.name || 'Jogador'),
        });

        mission.factionRewardBatchId = String(batch._id);
        factionReward = {
          factionId: String(faction.id),
          rewardType: AZIDEIA_CORRERIA.rewardType,
          quantityPerMember: AZIDEIA_CORRERIA.rewardQuantity,
          memberCount: memberIds.length,
          batchId: String(batch._id),
          dailyLimit: AZIDEIA_CORRERIA.factionDailyRewardLimit,
        };

        const message = await ChatMessage.create({
          channel: 'faccao',
          senderId: 'system:azideia:correria',
          senderName: 'Correria',
          factionId: String(faction.id),
          body: `${player.name || 'Jogador'} negociou com um Correria. A facção recebeu Corres para coletar.`,
          read: false,
          system: true,
          // Mantém um único tipo visual de card no chat. O alvo/recompensa vem no metadata.
          messageType: 'azideia_reward',
          metadata: {
            batchId: String(batch._id),
            targetType: 'correria',
            rewardType: AZIDEIA_CORRERIA.rewardType,
            quantityPerMember: AZIDEIA_CORRERIA.rewardQuantity,
            memberCount: memberIds.length,
            dailyLimit: AZIDEIA_CORRERIA.factionDailyRewardLimit,
            negotiatorId: String(player._id),
            negotiatorName: String(player.name || 'Jogador'),
            killerId: String(player._id),
            killerName: String(player.name || 'Jogador'),
            iconUrl: AZIDEIA_CORRERIA.iconUrl,
          },
        });

        emitToPlayers(memberIds, 'newChatMessage', () => normalizeMessage(message));
      }
    }
  }

  return factionReward;
}

export async function negotiateCorreria(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const targetId = String(req.params?.targetId || req.body?.targetId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Correria inválido', reason: 'invalid_target_id' });
    }

    await reconcileAzideiaMissionsForPlayer(player);

    const activeCounts = await getActiveAzideiaMissionCounts(player._id);
    const activeMembers = getActiveGangMembers(player);

    if (activeCounts.total >= MAX_PARALLEL_AZIDEIA_CONVOYS) {
      return res.status(429).json({
        error: 'Você já tem 3 comboios Azidéia em andamento.',
        reason: 'max_parallel_azideia_convoys',
        activeAzideiaConvoys: activeCounts.total,
        maxParallelAzideiaConvoys: MAX_PARALLEL_AZIDEIA_CONVOYS,
      });
    }

    if (activeMembers.length <= 0) {
      return res.status(400).json({
        error: 'Você precisa de pelo menos 1 membro ativo da gangue para enviar um comboio até o Correria.',
        reason: 'no_active_gang_member',
      });
    }

    const daily = ensureAzideiaDaily(player);
    if (daily.correriaNegotiations + activeCounts.travellingCorreria >= AZIDEIA_CORRERIA.dailyLimitPerPlayer) {
      return res.status(429).json({
        error: 'Limite diário de negociação com Correria atingido.',
        reason: 'correria_daily_limit_reached',
        ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria),
      });
    }

    const reservationKey = `pending:${String(player._id)}:${Date.now()}`;
    const target = await AzideiaTarget.findOneAndUpdate(
      {
        _id: targetId,
        type: 'correria',
        active: true,
        $or: [
          { reservedByPlayerId: null },
          { reservedByPlayerId: { $exists: false } },
          { reservedByPlayerId: '' },
        ],
      },
      {
        $set: {
          reservedByPlayerId: String(player._id),
          reservedByMissionId: reservationKey,
          reservedAt: new Date().toISOString(),
        },
      },
      { new: true },
    );

    if (!target) {
      await ensureActiveAzideiaTargets();
      return res.status(409).json({ error: 'Esse Correria já está negociando com outro comboio.', reason: 'target_already_reserved' });
    }

    const originTileX = clampTile(player.mapPosition?.tileX ?? 0);
    const originTileY = clampTile(player.mapPosition?.tileY ?? 0);
    const routeStart = getPlayerSpaceCenterTile(originTileX, originTileY);
    const routeTiles = buildDiagonalRoute(routeStart.tileX, routeStart.tileY, target.tileX, target.tileY);
    const returnRouteTiles = reverseRoute(routeTiles);
    const travelDurationMs = getAzideiaTravelDuration(routeTiles, player);
    const returnDurationMs = travelDurationMs;
    const launchedAt = Date.now();
    const arriveAtIso = new Date(launchedAt + travelDurationMs).toISOString();
    const returnAtIso = new Date(launchedAt + travelDurationMs + returnDurationMs).toISOString();
    const selectedMember = activeMembers[0];

    const mission = await AzideiaMission.create({
      playerId: String(player._id),
      playerName: String(player.name || 'Jogador'),
      factionId: player.factionId ? String(player.factionId) : null,
      targetId: String(target._id),
      targetType: 'correria',
      targetName: target.name || AZIDEIA_CORRERIA.name,
      targetModelUrl: target.modelUrl || AZIDEIA_CORRERIA.modelUrl,
      targetTileX: clampTile(target.tileX),
      targetTileY: clampTile(target.tileY),
      originTileX,
      originTileY,
      routeTiles,
      returnRouteTiles,
      travelDurationMs,
      returnDurationMs,
      costDirtyMoney: 0,
      rewardType: AZIDEIA_CORRERIA.rewardType,
      rewardQuantity: AZIDEIA_CORRERIA.rewardQuantity,
      selectedGangMemberId: selectedMember?.id || null,
      status: 'travelling',
      launchedAtIso: new Date(launchedAt).toISOString(),
      arriveAtIso,
      returnAtIso,
    });

    target.reservedByMissionId = String(mission._id);
    target.reservedAt = new Date(launchedAt).toISOString();
    await target.save();
    emitAzideiaMapChanged('correria_reserved', { targetId: String(target._id), missionId: String(mission._id), targetType: 'correria' });
    emitAzideiaMissionChanged('mission_started', mission);
    await ensureActiveAzideiaTargets();

    if (selectedMember) {
      selectedMember.status = 'marchando';
      selectedMember.activeAttackId = `azideia:${mission._id}`;
      selectedMember.marchingUntil = returnAtIso;
    }

    if (typeof player.markModified === 'function') {
      player.markModified('gang');
      player.markModified('azideiaDaily');
    }

    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);

    return res.json({
      success: true,
      phase: 'travelling',
      ...normalizeMission(mission),
      targetId: String(target._id),
      targetType: 'correria',
      costDirtyMoney: 0,
      immediateReward: null,
      factionReward: null,
      activeAzideiaConvoys: activeCounts.total + 1,
      maxParallelAzideiaConvoys: MAX_PARALLEL_AZIDEIA_CONVOYS,
      ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria + 1),
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_NEGOTIATE_CORRERIA]', error);
    return res.status(500).json({ error: 'Erro ao negociar com Correria' });
  }
}

export async function confirmAzideiaMissionArrival(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const missionId = String(req.params?.missionId || req.body?.missionId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(missionId)) {
      return res.status(400).json({ error: 'Missão Azidéia inválida', reason: 'invalid_mission_id' });
    }

    const mission = await AzideiaMission.findOne({ _id: missionId, playerId: String(player._id) });
    if (!mission) return res.status(404).json({ error: 'Missão Azidéia não encontrada', reason: 'mission_not_found' });

    if (mission.status === 'completed' || mission.status === 'returning') {
      return res.json({
        success: true,
        phase: mission.status,
        ...normalizeMission(mission),
        player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
      });
    }

    const now = Date.now();
    const arriveAtMs = Date.parse(mission.arriveAtIso || '') || 0;
    if (arriveAtMs && now + 1500 < arriveAtMs) {
      return res.status(409).json({
        error: 'O comboio ainda não chegou no alvo.',
        reason: 'convoy_not_arrived',
        arriveAtIso: mission.arriveAtIso,
      });
    }

    const arrival = await resolveAzideiaMissionArrival({ player, mission, nowMs: now });
    const factionReward = arrival.factionReward;

    if (typeof player.markModified === 'function') {
      player.markModified('azideiaDaily');
      player.markModified('convoyAccelerators');
      player.markModified('balances');
    }

    bumpVersion(player);
    await mission.save();
    await player.save();
    emitPlayerUpdate(player);
    emitAzideiaMissionChanged('mission_arrived', mission);
    await ensureActiveAzideiaTargets();

    const activeCounts = await getActiveAzideiaMissionCounts(player._id);

    return res.json({
      success: true,
      phase: 'returning',
      ...normalizeMission(mission),
      immediateReward: {
        rewardType: mission.rewardType || getTargetConfig(mission.targetType).rewardType,
        quantity: Math.max(0, Math.floor(toNumber(mission.rewardQuantity, getTargetConfig(mission.targetType).rewardQuantity))),
      },
      factionReward,
      ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria),
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_MISSION_ARRIVAL]', error);
    return res.status(500).json({ error: 'Erro ao confirmar chegada da Azidéia' });
  }
}

export async function confirmAzideiaMissionReturn(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const missionId = String(req.params?.missionId || req.body?.missionId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(missionId)) {
      return res.status(400).json({ error: 'Missão Azidéia inválida', reason: 'invalid_mission_id' });
    }

    const mission = await AzideiaMission.findOne({ _id: missionId, playerId: String(player._id) });
    if (!mission) return res.status(404).json({ error: 'Missão Azidéia não encontrada', reason: 'mission_not_found' });

    if (mission.status === 'travelling') {
      const arrival = await resolveAzideiaMissionArrival({ player, mission, nowMs: Date.now() });
      if (!arrival.changedMission && mission.status === 'travelling') {
        return res.status(409).json({
          error: 'O comboio ainda não chegou no alvo.',
          reason: 'convoy_not_arrived',
          arriveAtIso: mission.arriveAtIso,
        });
      }
    }

    const returned = await resolveAzideiaMissionReturn({ player, mission, nowMs: Date.now() });
    if (!returned.changedMission && mission.status !== 'completed') {
      return res.status(409).json({
        error: 'O comboio ainda está retornando.',
        reason: 'convoy_not_returned',
        returnAtIso: mission.returnAtIso,
      });
    }

    if (typeof player.markModified === 'function') {
      player.markModified('gang');
      player.markModified('azideiaDaily');
      player.markModified('convoyAccelerators');
      player.markModified('balances');
    }
    bumpVersion(player);
    await mission.save();
    await player.save();
    emitPlayerUpdate(player);
    emitAzideiaMissionChanged('mission_completed', mission);

    const activeCounts = await getActiveAzideiaMissionCounts(player._id);

    return res.json({
      success: true,
      phase: 'completed',
      ...normalizeMission(mission),
      activeAzideiaConvoys: activeCounts.total,
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_MISSION_RETURN]', error);
    return res.status(500).json({ error: 'Erro ao confirmar retorno da Azidéia' });
  }
}

function normalizeRewardBatch(batch) {
  return {
    id: String(batch._id),
    rewardType: batch.rewardType,
    quantity: Math.max(0, Math.floor(toNumber(batch.quantityPerMember, 1))),
    killerName: batch.killerName || 'Jogador',
    createdAt: batch.createdAtIso || batch.createdAt,
    sourceTargetType: batch.sourceTargetType || 'x9',
  };
}

async function getPendingBatchesForPlayer(player) {
  if (!player?.factionId) return [];
  const playerId = String(player._id);
  return AzideiaRewardBatch.find({
    factionId: String(player.factionId),
    memberIds: playerId,
    claimedBy: { $ne: playerId },
  }).sort({ createdAt: 1 });
}

function getCorreriaClaimRemainingToday(player) {
  const daily = ensureAzideiaDaily(player);
  const already = normalizeFactionRewardCap(daily.correriaFactionCorreReceived);
  return Math.max(0, AZIDEIA_CORRERIA.factionDailyRewardLimit - already);
}

function summarizeRewardBatches(player, batches) {
  let correRemaining = getCorreriaClaimRemainingToday(player);
  const available = { convoy_2x: 0, corre: 0 };

  for (const batch of batches) {
    const rewardType = batch.rewardType === 'corre' ? 'corre' : 'convoy_2x';
    const quantity = Math.max(0, Math.floor(toNumber(batch.quantityPerMember, 1)));

    if (rewardType === 'corre') {
      const allowed = Math.min(quantity, correRemaining);
      available.corre += allowed;
      correRemaining -= allowed;
    } else {
      available.convoy_2x += quantity;
    }
  }

  return {
    available,
    totalAvailable: available.convoy_2x + available.corre,
    correriaFactionReceivedToday: normalizeFactionRewardCap(ensureAzideiaDaily(player).correriaFactionCorreReceived),
    correriaFactionDailyLimit: AZIDEIA_CORRERIA.factionDailyRewardLimit,
    batches: batches.map(normalizeRewardBatch),
  };
}

export async function getMyAzideiaRewards(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const batches = await getPendingBatchesForPlayer(player);
    return res.json({
      factionId: player.factionId || null,
      ...summarizeRewardBatches(player, batches),
    });
  } catch (error) {
    console.error('[AZIDEIA_REWARDS_ME]', error);
    return res.status(500).json({ error: 'Erro ao buscar recompensas Azidéia' });
  }
}

export async function claimMyAzideiaRewards(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const batches = await getPendingBatchesForPlayer(player);
    const playerId = String(player._id);
    const claimed = { convoy_2x: 0, corre: 0 };
    let correRemaining = getCorreriaClaimRemainingToday(player);

    player.balances = player.balances || {};
    const accelerators = ensureConvoyAccelerators(player);
    const daily = ensureAzideiaDaily(player);

    for (const batch of batches) {
      if (batch.claimedBy.includes(playerId)) continue;

      const rewardType = batch.rewardType === 'corre' ? 'corre' : 'convoy_2x';
      const quantity = Math.max(0, Math.floor(toNumber(batch.quantityPerMember, 1)));
      if (quantity <= 0) continue;

      if (rewardType === 'corre') {
        const grant = Math.min(quantity, correRemaining);
        if (grant <= 0) continue;

        player.balances.corre = Math.max(0, Math.floor(toNumber(player.balances.corre, 0))) + grant;
        daily.correriaFactionCorreReceived = normalizeFactionRewardCap(daily.correriaFactionCorreReceived + grant);
        correRemaining -= grant;
        claimed.corre += grant;
      } else {
        accelerators.twoX += quantity;
        claimed.convoy_2x += quantity;
      }

      batch.claimedBy.push(playerId);
      await batch.save();
    }

    const totalClaimed = claimed.convoy_2x + claimed.corre;
    if (totalClaimed > 0) {
      if (typeof player.markModified === 'function') {
        player.markModified('convoyAccelerators');
        player.markModified('balances');
        player.markModified('azideiaDaily');
      }
      bumpVersion(player);
      await player.save();
      emitPlayerUpdate(player);
    }

    const remainingBatches = await getPendingBatchesForPlayer(player);
    return res.json({
      factionId: player.factionId || null,
      claimed,
      totalClaimed,
      ...summarizeRewardBatches(player, remainingBatches),
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_REWARDS_CLAIM]', error);
    return res.status(500).json({ error: 'Erro ao coletar recompensas Azidéia' });
  }
}
