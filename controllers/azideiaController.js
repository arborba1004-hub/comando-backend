import mongoose from 'mongoose';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
import ChatMessage from '../models/ChatMessage.js';
import AzideiaTarget from '../models/AzideiaTarget.js';
import AzideiaRewardBatch from '../models/AzideiaRewardBatch.js';
import { AZIDEIA_X9 } from '../data/azideiaCatalog.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { emitToPlayer, emitToPlayers } from '../services/socketEmitter.js';

const GRID_WIDTH = 120;
const GRID_HEIGHT = 120;

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

async function usedTiles() {
  const activeTargets = await AzideiaTarget.find({ active: true }).select('tileX tileY').lean();
  const players = await Player.find({}, { 'mapPosition.tileX': 1, 'mapPosition.tileY': 1 }).lean();
  const set = new Set();
  for (const target of activeTargets) set.add(`${target.tileX},${target.tileY}`);
  for (const player of players) {
    if (player.mapPosition) set.add(`${player.mapPosition.tileX},${player.mapPosition.tileY}`);
  }
  return set;
}

async function createRandomX9Target(occupied = null) {
  const used = occupied || await usedTiles();
  let tileX = 0;
  let tileY = 0;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    tileX = Math.floor(Math.random() * GRID_WIDTH);
    tileY = Math.floor(Math.random() * GRID_HEIGHT);
    const key = `${tileX},${tileY}`;
    if (!used.has(key)) {
      used.add(key);
      break;
    }
  }

  return AzideiaTarget.create({
    type: 'x9',
    name: AZIDEIA_X9.name,
    modelUrl: AZIDEIA_X9.modelUrl,
    tileX,
    tileY,
    active: true,
    spawnedAt: new Date().toISOString(),
  });
}

async function ensureActiveX9Targets() {
  const activeCount = await AzideiaTarget.countDocuments({ type: 'x9', active: true });
  const missing = Math.max(0, AZIDEIA_X9.activeCount - activeCount);
  if (missing <= 0) return;
  const occupied = await usedTiles();
  for (let i = 0; i < missing; i += 1) {
    await createRandomX9Target(occupied);
  }
}

function buildDailyEnvelope(player) {
  const daily = ensureAzideiaDaily(player);
  const dailyKills = Math.max(0, Math.floor(toNumber(daily.x9Kills, 0)));
  return {
    dailyKills,
    dailyLimit: AZIDEIA_X9.dailyLimitPerPlayer,
    remainingToday: Math.max(0, AZIDEIA_X9.dailyLimitPerPlayer - dailyKills),
  };
}

export async function getX9Targets(req, res) {
  try {
    await ensureActiveX9Targets();
    const targets = await AzideiaTarget.find({ type: 'x9', active: true })
      .sort({ createdAt: 1 })
      .limit(AZIDEIA_X9.activeCount)
      .lean();

    const daily = buildDailyEnvelope(req.player);
    return res.json({
      targets: targets.map(normalizeTarget),
      costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
      ...daily,
    });
  } catch (error) {
    console.error('[AZIDEIA_X9_TARGETS]', error);
    return res.status(500).json({ error: 'Erro ao buscar X9 no mapa' });
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

    const daily = ensureAzideiaDaily(player);
    if (daily.x9Kills >= AZIDEIA_X9.dailyLimitPerPlayer) {
      return res.status(429).json({
        error: 'Limite diário de Azidéia atingido.',
        reason: 'daily_limit_reached',
        ...buildDailyEnvelope(player),
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

    const target = await AzideiaTarget.findOneAndUpdate(
      { _id: targetId, type: 'x9', active: true },
      {
        $set: {
          active: false,
          killedByPlayerId: String(player._id),
          killedByPlayerName: String(player.name || 'Jogador'),
          killedAt: new Date().toISOString(),
        },
      },
      { new: true }
    );

    if (!target) {
      await ensureActiveX9Targets();
      return res.status(409).json({ error: 'Esse X9 já foi eliminado.', reason: 'target_already_killed' });
    }

    player.balances.dirtyMoney = Math.max(0, dirtyMoney - AZIDEIA_X9.costDirtyMoney);
    daily.x9Kills += 1;
    const accelerators = ensureConvoyAccelerators(player);
    accelerators.twoX += AZIDEIA_X9.rewardQuantity;

    if (typeof player.markModified === 'function') {
      player.markModified('balances');
      player.markModified('azideiaDaily');
      player.markModified('convoyAccelerators');
    }

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
            sourceTargetId: String(target._id),
            killerId: String(player._id),
            killerName: String(player.name || 'Jogador'),
          });

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

    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);

    await ensureActiveX9Targets();

    const routeTiles = buildDiagonalRoute(
      player.mapPosition?.tileX ?? 0,
      player.mapPosition?.tileY ?? 0,
      target.tileX,
      target.tileY
    );

    const travelDurationMs = Math.max(1400, Math.min(8000, (routeTiles.length - 1) * 280));

    return res.json({
      success: true,
      targetId: String(target._id),
      targetType: 'x9',
      costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
      immediateReward: {
        rewardType: AZIDEIA_X9.rewardType,
        quantity: AZIDEIA_X9.rewardQuantity,
      },
      factionReward,
      routeTiles,
      travelDurationMs,
      ...buildDailyEnvelope(player),
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_ATTACK_X9]', error);
    return res.status(500).json({ error: 'Erro ao lançar Azidéia contra X9' });
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
