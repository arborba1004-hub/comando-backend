import mongoose from 'mongoose';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
import ChatMessage from '../models/ChatMessage.js';
import AzideiaTarget from '../models/AzideiaTarget.js';
import AzideiaMission from '../models/AzideiaMission.js';
import AzideiaRewardBatch from '../models/AzideiaRewardBatch.js';
import { AZIDEIA_X9 } from '../data/azideiaCatalog.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { emitToPlayer, emitToPlayers } from '../services/socketEmitter.js';

const GRID_WIDTH = 120;
const GRID_HEIGHT = 120;
const MAX_PARALLEL_AZIDEIA_CONVOYS = 3;
const PLAYER_SPACE_WIDTH = 6;
const PLAYER_SPACE_HEIGHT = 6;
const X9_SPAWN_PADDING_TILES = 1;
const X9_STALE_RESERVATION_MS = 10 * 60 * 1000;

const AVAILABLE_X9_QUERY = {
  type: 'x9',
  active: true,
  $or: [
    { reservedByPlayerId: null },
    { reservedByPlayerId: { $exists: false } },
    { reservedByPlayerId: '' },
  ],
};

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
    player.azideiaDaily = { date: key, x9Kills: 0 };
  } else {
    player.azideiaDaily = {
      date: key,
      x9Kills: Math.max(0, Math.floor(toNumber(current.x9Kills, 0))),
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

function normalizeTarget(target) {
  return {
    id: String(target._id),
    type: target.type || 'x9',
    name: target.name || AZIDEIA_X9.name,
    modelUrl: target.modelUrl || AZIDEIA_X9.modelUrl,
    tileX: clampTile(target.tileX),
    tileY: clampTile(target.tileY),
    costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
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

function normalizeMission(mission) {
  if (!mission) return null;
  return {
    missionId: String(mission._id),
    status: mission.status,
    targetId: String(mission.targetId),
    targetType: mission.targetType || 'x9',
    targetName: mission.targetName || 'X9',
    targetModelUrl: mission.targetModelUrl || AZIDEIA_X9.modelUrl,
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
    rewardType: mission.rewardType || AZIDEIA_X9.rewardType,
    rewardQuantity: Math.max(0, Math.floor(toNumber(mission.rewardQuantity, AZIDEIA_X9.rewardQuantity))),
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
  if (arriveAtMs && nowMs + 1500 < arriveAtMs) {
    return { changedPlayer: false, changedMission: false, factionReward: null };
  }

  const target = await AzideiaTarget.findOne({
    _id: mission.targetId,
    type: 'x9',
    reservedByMissionId: String(mission._id),
  });

  if (target && target.active) {
    target.active = false;
    target.killedByPlayerId = String(player._id);
    target.killedByPlayerName = String(player.name || 'Jogador');
    target.killedAt = new Date(nowMs).toISOString();
    await target.save();
  }

  let changedPlayer = false;
  const daily = ensureAzideiaDaily(player);
  if (!mission.rewardGrantedAtIso) {
    daily.x9Kills += 1;
    changedPlayer = true;
  }

  const factionReward = mission.rewardGrantedAtIso
    ? null
    : await grantAzideiaRewards({ player, mission });

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
      { arriveAtIso: { $lte: new Date(nowMs + 1500).toISOString() } },
      { returnAtIso: { $lte: new Date(nowMs + 1500).toISOString() } },
    ],
  }).sort({ createdAt: 1 });

  let changedPlayer = false;
  let changedMissionCount = 0;

  for (const mission of missions) {
    let missionChanged = false;

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
  }

  if (changedPlayer) {
    if (typeof player.markModified === 'function') {
      player.markModified('gang');
      player.markModified('azideiaDaily');
      player.markModified('convoyAccelerators');
    }
    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);
    await ensureActiveX9Targets();
  }

  return { changedPlayer, changedMissionCount };
}

function getActiveGangMembers(player) {
  return Array.isArray(player?.gang?.members)
    ? player.gang.members.filter((member) => member?.status === 'ativo')
    : [];
}

async function getActiveAzideiaMissionCounts(playerId) {
  const [total, travelling] = await Promise.all([
    AzideiaMission.countDocuments({ playerId: String(playerId), status: { $in: ['travelling', 'returning'] } }),
    AzideiaMission.countDocuments({ playerId: String(playerId), status: 'travelling' }),
  ]);
  return { total, travelling };
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

async function createRandomX9Target(occupied = null) {
  const used = occupied || await usedTiles();
  const { tileX, tileY } = pickFreeX9Tile(used);

  return AzideiaTarget.create({
    type: 'x9',
    name: AZIDEIA_X9.name,
    modelUrl: AZIDEIA_X9.modelUrl,
    tileX,
    tileY,
    active: true,
    reservedByPlayerId: null,
    reservedByMissionId: null,
    reservedAt: null,
    spawnedAt: new Date().toISOString(),
  });
}

async function cleanupStaleX9Reservations() {
  const staleIso = new Date(Date.now() - X9_STALE_RESERVATION_MS).toISOString();

  // Se um comboio travou/foi perdido por refresh, o X9 pode ficar ativo e
  // reservado para sempre. Ele não aparece para ninguém e ainda ocupa tile.
  // Como uma missão Azidéia dura segundos, 10 minutos é margem segura.
  await AzideiaTarget.updateMany(
    {
      type: 'x9',
      active: true,
      reservedByPlayerId: { $nin: [null, ''] },
      $or: [
        { reservedAt: { $lte: staleIso } },
        { reservedAt: null },
        { reservedAt: { $exists: false } },
      ],
    },
    {
      $set: {
        active: false,
        killedAt: staleIso,
      },
    },
  );
}

async function ensureActiveX9Targets() {
  await cleanupStaleX9Reservations();

  // Conta apenas X9 realmente disponíveis no mapa. X9 reservado por comboio
  // não deve entrar nessa conta; caso contrário, com 3 comboios em andamento
  // o mapa fica com 17 X9 clicáveis e o backend acha que ainda há 20.
  const availableCount = await AzideiaTarget.countDocuments(AVAILABLE_X9_QUERY);
  const missing = Math.max(0, AZIDEIA_X9.activeCount - availableCount);
  if (missing <= 0) return;
  const occupied = await usedTiles();
  for (let i = 0; i < missing; i += 1) {
    await createRandomX9Target(occupied);
  }
}

function buildDailyEnvelope(player, travellingReservations = 0) {
  const daily = ensureAzideiaDaily(player);
  const dailyKills = Math.max(0, Math.floor(toNumber(daily.x9Kills, 0)));
  const reserved = Math.max(0, Math.floor(toNumber(travellingReservations, 0)));
  return {
    dailyKills,
    dailyLimit: AZIDEIA_X9.dailyLimitPerPlayer,
    remainingToday: Math.max(0, AZIDEIA_X9.dailyLimitPerPlayer - dailyKills - reserved),
  };
}

export async function getX9Targets(req, res) {
  try {
    if (req.player) await reconcileAzideiaMissionsForPlayer(req.player);
    await ensureActiveX9Targets();
    const targets = await AzideiaTarget.find(AVAILABLE_X9_QUERY)
      .sort({ createdAt: 1 })
      .limit(AZIDEIA_X9.activeCount)
      .lean();

    const activeCounts = await getActiveAzideiaMissionCounts(req.player._id);
    const daily = buildDailyEnvelope(req.player, activeCounts.travelling);
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
    if (daily.x9Kills + activeCounts.travelling >= AZIDEIA_X9.dailyLimitPerPlayer) {
      return res.status(429).json({
        error: 'Limite diário de Azidéia atingido.',
        reason: 'daily_limit_reached',
        ...buildDailyEnvelope(player, activeCounts.travelling),
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

    const target = await AzideiaTarget.findOne({
      _id: targetId,
      type: 'x9',
      active: true,
      $or: [
        { reservedByPlayerId: null },
        { reservedByPlayerId: { $exists: false } },
        { reservedByPlayerId: '' },
      ],
    });

    if (!target) {
      await ensureActiveX9Targets();
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

    target.reservedByPlayerId = String(player._id);
    target.reservedByMissionId = String(mission._id);
    target.reservedAt = new Date(launchedAt).toISOString();
    await target.save();

    // Assim que um X9 é reservado por um comboio, ele deixa de ser disponível
    // para os demais jogadores. Já repõe outro X9 aleatório disponível para
    // manter sempre AZIDEIA_X9.activeCount alvos clicáveis no mapa.
    await ensureActiveX9Targets();

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
      ...buildDailyEnvelope(player, activeCounts.travelling + 1),
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
        error: 'O comboio ainda não chegou no X9.',
        reason: 'convoy_not_arrived',
        arriveAtIso: mission.arriveAtIso,
      });
    }

    const arrival = await resolveAzideiaMissionArrival({ player, mission, nowMs: now });
    const factionReward = arrival.factionReward;

    if (typeof player.markModified === 'function') {
      player.markModified('azideiaDaily');
      player.markModified('convoyAccelerators');
    }

    bumpVersion(player);
    await mission.save();
    await player.save();
    emitPlayerUpdate(player);
    await ensureActiveX9Targets();

    const travelling = await AzideiaMission.countDocuments({ playerId: String(player._id), status: 'travelling' });

    return res.json({
      success: true,
      phase: 'returning',
      ...normalizeMission(mission),
      immediateReward: {
        rewardType: AZIDEIA_X9.rewardType,
        quantity: AZIDEIA_X9.rewardQuantity,
      },
      factionReward,
      ...buildDailyEnvelope(player, travelling),
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
          error: 'O comboio ainda não chegou no X9.',
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
    }
    bumpVersion(player);
    await mission.save();
    await player.save();
    emitPlayerUpdate(player);

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

export async function getMyAzideiaRewards(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const batches = await getPendingBatchesForPlayer(player);
    const total = batches.reduce((sum, batch) => sum + Math.max(0, Math.floor(toNumber(batch.quantityPerMember, 1))), 0);

    return res.json({
      factionId: player.factionId || null,
      available: { convoy_2x: total },
      totalAvailable: total,
      batches: batches.map(normalizeRewardBatch),
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
    let total = 0;

    for (const batch of batches) {
      const quantity = Math.max(0, Math.floor(toNumber(batch.quantityPerMember, 1)));
      total += quantity;
      if (!batch.claimedBy.includes(playerId)) {
        batch.claimedBy.push(playerId);
        await batch.save();
      }
    }

    if (total > 0) {
      const accelerators = ensureConvoyAccelerators(player);
      accelerators.twoX += total;
      if (typeof player.markModified === 'function') player.markModified('convoyAccelerators');
      bumpVersion(player);
      await player.save();
      emitPlayerUpdate(player);
    }

    const remainingBatches = await getPendingBatchesForPlayer(player);
    const remaining = remainingBatches.reduce((sum, batch) => sum + Math.max(0, Math.floor(toNumber(batch.quantityPerMember, 1))), 0);

    return res.json({
      factionId: player.factionId || null,
      claimed: { convoy_2x: total },
      totalClaimed: total,
      available: { convoy_2x: remaining },
      totalAvailable: remaining,
      batches: remainingBatches.map(normalizeRewardBatch),
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_REWARDS_CLAIM]', error);
    return res.status(500).json({ error: 'Erro ao coletar recompensas Azidéia' });
  }
}
