import mongoose from 'mongoose';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
import ChatMessage from '../models/ChatMessage.js';
import AzideiaTarget from '../models/AzideiaTarget.js';
import AzideiaMission from '../models/AzideiaMission.js';
import AzideiaRewardBatch from '../models/AzideiaRewardBatch.js';
import {
  AZIDEIA_X9,
  AZIDEIA_CORRERIA,
  AZIDEIA_MESTRE_OBRAS,
  AZIDEIA_TARGETS,
  getMestreObrasCostDirtyMoney,
} from '../data/azideiaCatalog.js';
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
const AVAILABLE_MESTRE_OBRAS_QUERY = availableTargetQuery('mestre_obras');

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

function ensureBarracoAccelerators(player) {
  const current = player.barracoAccelerators || {};
  player.barracoAccelerators = {
    seconds: Math.max(0, Math.floor(toNumber(current.seconds, 0))),
  };
  return player.barracoAccelerators;
}

function getTargetCostDirtyMoney(type = 'x9', player = null) {
  if (type === 'mestre_obras') {
    return getMestreObrasCostDirtyMoney(player?.niveis?.barracoLevel ?? 1);
  }
  return Math.max(0, Math.floor(toNumber(getTargetConfig(type).costDirtyMoney, 0)));
}

function ensureAzideiaDaily(player) {
  const key = todayKey();
  const current = player.azideiaDaily || {};
  if (current.date !== key) {
    player.azideiaDaily = {
      date: key,
      x9Kills: 0,
      x9FactionAcceleratorsReceived: 0,
      correriaNegotiations: 0,
      correriaFactionCorreReceived: 0,
      mestreObrasPayments: 0,
      mestreObrasFactionBarracoAcceleratorsReceived: 0,
    };
  } else {
    player.azideiaDaily = {
      date: key,
      x9Kills: Math.max(0, Math.floor(toNumber(current.x9Kills, 0))),
      x9FactionAcceleratorsReceived: Math.max(0, Math.floor(toNumber(current.x9FactionAcceleratorsReceived, 0))),
      correriaNegotiations: Math.max(0, Math.floor(toNumber(current.correriaNegotiations, 0))),
      correriaFactionCorreReceived: Math.max(0, Math.floor(toNumber(current.correriaFactionCorreReceived, 0))),
      mestreObrasPayments: Math.max(0, Math.floor(toNumber(current.mestreObrasPayments, 0))),
      mestreObrasFactionBarracoAcceleratorsReceived: Math.max(0, Math.floor(toNumber(current.mestreObrasFactionBarracoAcceleratorsReceived, 0))),
    };
  }
  return player.azideiaDaily;
}


function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

function parseDateMs(value) {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

function getBatchCreatedMs(batch) {
  return parseDateMs(batch?.createdAtIso) || parseDateMs(batch?.createdAt) || null;
}

function getFactionMemberRecord(faction, playerId) {
  if (!faction || !Array.isArray(faction.members)) return null;
  const safePlayerId = String(playerId || '').trim();
  if (!safePlayerId) return null;
  return faction.members.find((member) => String(member?.playerId || '').trim() === safePlayerId) || null;
}

function isPlayerEligibleForFactionBatch(rewardContext, playerId, batch) {
  const safePlayerId = String(playerId || '').trim();
  if (!safePlayerId) return false;

  const currentMemberIds = uniqueStrings(rewardContext?.memberIds || []);
  if (!currentMemberIds.includes(safePlayerId)) return false;

  const memberRecord = getFactionMemberRecord(rewardContext?.faction, safePlayerId);
  if (!memberRecord) {
    // Fallback profissional para dados legados: quando o jogador aparece pela
    // busca Player.factionId, mas a facção não tem member.joinedAt normalizado.
    return true;
  }

  const joinedAtMs = parseDateMs(memberRecord.joinedAt);
  const batchCreatedMs = getBatchCreatedMs(batch);

  // Se faltar data em documento legado, mantém o lote coletável para não
  // bloquear recompensa já gerada antes da correção.
  if (!joinedAtMs || !batchCreatedMs) return true;

  return joinedAtMs <= batchCreatedMs + 1000;
}

function buildFactionLookup(factionId) {
  const safe = String(factionId || '').trim();
  if (!safe) return null;
  const or = [{ id: safe }];
  if (mongoose.Types.ObjectId.isValid(safe)) {
    or.push({ _id: safe });
  }
  return { $or: or };
}

async function findFactionByAnyId(factionId) {
  const query = buildFactionLookup(factionId);
  if (!query) return null;
  return Faction.findOne(query);
}

function getFactionIdAliases(faction, fallbackFactionId = null) {
  return uniqueStrings([
    fallbackFactionId,
    faction?.id,
    faction?._id ? String(faction._id) : '',
  ]);
}

async function findFactionByPlayerMembership(player) {
  const playerId = String(player?._id || '').trim();
  if (!playerId) return null;
  return Faction.findOne({ 'members.playerId': playerId });
}

async function getFactionRewardContext(player) {
  const fallbackFactionId = String(player?.factionId || '').trim();
  if (!player?._id) return null;

  const faction = fallbackFactionId
    ? (await findFactionByAnyId(fallbackFactionId)) || (await findFactionByPlayerMembership(player))
    : await findFactionByPlayerMembership(player);
  if (!faction && !fallbackFactionId) return null;

  const factionAliases = getFactionIdAliases(faction, fallbackFactionId);
  const canonicalFactionId = String(faction?.id || fallbackFactionId).trim();

  const memberIds = new Set();

  // Fonte principal: documento oficial da facção.
  if (faction && Array.isArray(faction.members)) {
    for (const member of faction.members) {
      const id = String(member?.playerId || '').trim();
      if (id) memberIds.add(id);
    }
  }

  // Fonte de segurança: jogadores que apontam para a facção. Isso corrige dados
  // legados onde alguns players ficaram com factionId = _id do Mongo e outros
  // com factionId = id público da facção.
  if (factionAliases.length > 0) {
    const playersInFaction = await Player.find({ factionId: { $in: factionAliases } })
      .select('_id')
      .lean();
    for (const item of playersInFaction) {
      const id = String(item?._id || '').trim();
      if (id) memberIds.add(id);
    }
  }

  // Nunca deixa o atacante fora do lote se ele tem factionId.
  memberIds.add(String(player._id));

  return {
    faction,
    factionId: canonicalFactionId,
    factionAliases: uniqueStrings([canonicalFactionId, ...factionAliases]),
    memberIds: Array.from(memberIds),
  };
}

function getFactionRewardSpecForTargetType(targetType = 'x9') {
  if (targetType === 'correria') {
    return {
      rewardType: AZIDEIA_CORRERIA.rewardType,
      quantityPerMember: AZIDEIA_CORRERIA.rewardQuantity,
      dailyLimit: AZIDEIA_CORRERIA.factionDailyRewardLimit,
      senderId: 'system:azideia:correria',
      senderName: 'Correria',
      chatBody: (playerName) => `${playerName} negociou com um Correria. A facção recebeu Corres para coletar.`,
      chatExtraMetadata: (player) => ({
        negotiatorId: String(player._id),
        negotiatorName: String(player.name || 'Jogador'),
        iconUrl: AZIDEIA_CORRERIA.iconUrl,
      }),
    };
  }

  if (targetType === 'mestre_obras') {
    return {
      rewardType: AZIDEIA_MESTRE_OBRAS.rewardType,
      quantityPerMember: AZIDEIA_MESTRE_OBRAS.factionRewardQuantitySeconds,
      dailyLimit: AZIDEIA_MESTRE_OBRAS.factionDailyRewardLimit,
      senderId: 'system:azideia:mestre_obras',
      senderName: 'Mestre de Obras',
      chatBody: (playerName) => `${playerName} pagou um Mestre de Obras. A facção recebeu aceleradores de evolução do barraco para coletar.`,
      chatExtraMetadata: (player) => ({
        payerId: String(player._id),
        payerName: String(player.name || 'Jogador'),
        modelUrl: AZIDEIA_MESTRE_OBRAS.modelUrl,
      }),
    };
  }

  return {
    rewardType: AZIDEIA_X9.rewardType,
    quantityPerMember: AZIDEIA_X9.rewardQuantity,
    dailyLimit: AZIDEIA_X9.factionDailyRewardLimit,
    senderId: 'system:azideia',
    senderName: 'Azidéia',
    chatBody: (playerName) => `${playerName} eliminou um X9. A facção recebeu aceleradores para coletar.`,
    chatExtraMetadata: () => ({ iconUrl: AZIDEIA_X9.iconUrl }),
  };
}

function getFactionCollectableMemberIds(rewardContext, referenceDate = null) {
  const ids = uniqueStrings(rewardContext?.memberIds || []);
  const referenceMs = parseDateMs(referenceDate);

  if (!referenceMs || !rewardContext?.faction || !Array.isArray(rewardContext.faction.members)) {
    return ids;
  }

  return ids.filter((memberId) => {
    const memberRecord = getFactionMemberRecord(rewardContext.faction, memberId);
    if (!memberRecord) return true;

    const joinedAtMs = parseDateMs(memberRecord.joinedAt);
    if (!joinedAtMs) return true;

    return joinedAtMs <= referenceMs + 1000;
  });
}


function buildAzideiaRewardChatPayload({ rewardContext, batch, spec, targetType, actorId, actorName }) {
  const safeTargetType = targetType || batch?.sourceTargetType || 'x9';
  const safeActorId = String(actorId || batch?.killerId || '').trim();
  const safeActorName = String(actorName || batch?.killerName || 'Jogador').trim() || 'Jogador';
  const safeMemberIds = uniqueStrings(batch?.memberIds || rewardContext?.memberIds || []);
  const quantityPerMember = Math.max(1, Math.floor(toNumber(batch?.quantityPerMember, spec.quantityPerMember)));

  return {
    channel: 'faccao',
    senderId: spec.senderId,
    senderName: spec.senderName,
    factionId: rewardContext.factionId,
    body: spec.chatBody(safeActorName),
    read: false,
    system: true,
    messageType: 'azideia_reward',
    metadata: {
      batchId: String(batch._id),
      sourceMissionId: String(batch.sourceMissionId || ''),
      sourceTargetId: String(batch.sourceTargetId || ''),
      targetType: safeTargetType,
      rewardType: spec.rewardType,
      quantityPerMember,
      memberCount: safeMemberIds.length,
      dailyLimit: spec.dailyLimit,
      killerId: safeActorId,
      killerName: safeActorName,
      ...spec.chatExtraMetadata({ _id: safeActorId, name: safeActorName }),
    },
  };
}

async function ensureFactionRewardChatMessage({ rewardContext, batch, targetType, actorId, actorName, emit = false }) {
  if (!rewardContext || !batch?._id) return { message: null, created: false };

  const safeTargetType = targetType || batch.sourceTargetType || 'x9';
  const spec = getFactionRewardSpecForTargetType(safeTargetType);
  const payload = buildAzideiaRewardChatPayload({
    rewardContext,
    batch,
    spec,
    targetType: safeTargetType,
    actorId,
    actorName,
  });

  const batchId = String(batch._id);
  let message = await ChatMessage.findOne({
    channel: 'faccao',
    messageType: 'azideia_reward',
    'metadata.batchId': batchId,
  });

  let created = false;
  if (!message) {
    message = await ChatMessage.create(payload);
    created = true;
  } else {
    let changed = false;
    if (String(message.factionId || '') !== String(payload.factionId || '')) {
      message.factionId = payload.factionId;
      changed = true;
    }
    if (String(message.body || '') !== String(payload.body || '')) {
      message.body = payload.body;
      changed = true;
    }

    const currentMetadata = message.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    const nextMetadata = {
      ...currentMetadata,
      ...payload.metadata,
      // Mantém dados importantes de lotes antigos, mas recalcula contadores que
      // alimentam o card do chat da facção.
      batchId,
      memberCount: payload.metadata.memberCount,
      quantityPerMember: payload.metadata.quantityPerMember,
      dailyLimit: payload.metadata.dailyLimit,
      rewardType: payload.metadata.rewardType,
      targetType: payload.metadata.targetType,
    };

    if (JSON.stringify(currentMetadata) !== JSON.stringify(nextMetadata)) {
      message.metadata = nextMetadata;
      changed = true;
    }

    if (changed) await message.save();
  }

  if (emit && message) {
    const memberIds = uniqueStrings(batch.memberIds || rewardContext.memberIds || []);
    emitToPlayers(memberIds, 'newChatMessage', () => normalizeMessage(message));
  }

  return { message, created };
}

async function createFactionClaimableRewardForAzideia({ player, mission, targetType = 'x9' }) {
  if (!player?._id || !mission?._id) return null;

  const rewardContext = await getFactionRewardContext(player);
  if (!rewardContext) return null;

  // O jogador que executou a ação recebe a recompensa individual imediatamente.
  // A recompensa de facção fica pendente no chat para TODOS os membros da facção,
  // inclusive o executor, e só é aplicada no player quando cada membro coletar.
  const memberIds = getFactionCollectableMemberIds(rewardContext);
  if (memberIds.length <= 0) return null;

  const spec = getFactionRewardSpecForTargetType(targetType);
  const sourceMissionId = String(mission._id);
  const sourceTargetId = String(mission.targetId || '');
  const actorId = String(player._id);

  const existingBatch = await AzideiaRewardBatch.findOne({
    $or: [
      { sourceMissionId, rewardType: spec.rewardType },
      {
        sourceTargetType: targetType,
        sourceTargetId,
        killerId: actorId,
        rewardType: spec.rewardType,
      },
    ],
  });

  if (existingBatch) {
    const mergedMemberIds = uniqueStrings([...existingBatch.memberIds, ...memberIds]);

    let changed = false;
    if (existingBatch.sourceMissionId !== sourceMissionId) {
      existingBatch.sourceMissionId = sourceMissionId;
      changed = true;
    }
    if (existingBatch.factionId !== rewardContext.factionId) {
      existingBatch.factionId = rewardContext.factionId;
      changed = true;
    }
    if (JSON.stringify(existingBatch.memberIds || []) !== JSON.stringify(mergedMemberIds)) {
      existingBatch.memberIds = mergedMemberIds;
      changed = true;
    }
    if (changed) await existingBatch.save();
    mission.factionRewardBatchId = String(existingBatch._id);

    try {
      await ensureFactionRewardChatMessage({
        rewardContext,
        batch: existingBatch,
        targetType,
        actorId,
        actorName: String(player.name || 'Jogador'),
        emit: false,
      });
    } catch (chatError) {
      console.error('[AZIDEIA_FACTION_REWARD_CHAT_REPAIR_NON_BLOCKING]', chatError);
    }

    return {
      factionId: rewardContext.factionId,
      rewardType: spec.rewardType,
      quantityPerMember: spec.quantityPerMember,
      memberCount: mergedMemberIds.length,
      batchId: String(existingBatch._id),
      dailyLimit: spec.dailyLimit,
      alreadyExisted: true,
    };
  }

  const batch = await AzideiaRewardBatch.create({
    factionId: rewardContext.factionId,
    rewardType: spec.rewardType,
    quantityPerMember: spec.quantityPerMember,
    memberIds,
    sourceMissionId,
    sourceTargetType: targetType,
    sourceTargetId,
    killerId: actorId,
    killerName: String(player.name || 'Jogador'),
  });

  mission.factionRewardBatchId = String(batch._id);

  const factionReward = {
    factionId: rewardContext.factionId,
    rewardType: spec.rewardType,
    quantityPerMember: spec.quantityPerMember,
    memberCount: memberIds.length,
    batchId: String(batch._id),
    dailyLimit: spec.dailyLimit,
  };

  // Chat é apenas aviso. A recompensa verdadeira já está salva no lote.
  try {
    await ensureFactionRewardChatMessage({
      rewardContext,
      batch,
      targetType,
      actorId,
      actorName: String(player.name || 'Jogador'),
      emit: true,
    });
  } catch (chatError) {
    console.error('[AZIDEIA_FACTION_REWARD_CHAT_NON_BLOCKING]', chatError);
  }

  return factionReward;
}

async function createFactionClaimableRewardSafely({ player, mission, targetType }) {
  try {
    return await createFactionClaimableRewardForAzideia({ player, mission, targetType });
  } catch (error) {
    console.error('[AZIDEIA_FACTION_REWARD_BATCH_NON_BLOCKING]', {
      playerId: String(player?._id || ''),
      missionId: String(mission?._id || ''),
      targetType,
      error,
    });
    return null;
  }
}

async function upsertFactionRewardBatchFromResolvedMission({ rewardContext, mission }) {
  if (!rewardContext || !mission?._id) return null;

  const targetType = mission.targetType || 'x9';
  const spec = getFactionRewardSpecForTargetType(targetType);
  const sourceMissionId = String(mission._id);
  const sourceTargetId = String(mission.targetId || '');
  const actorId = String(mission.playerId || '').trim();
  if (!actorId) return null;

  const memberIds = getFactionCollectableMemberIds(
    rewardContext,
    mission.rewardGrantedAtIso || mission.updatedAt || mission.createdAt || null,
  );
  if (memberIds.length <= 0) return null;

  const existingBatch = await AzideiaRewardBatch.findOne({
    $or: [
      { sourceMissionId, rewardType: spec.rewardType },
      {
        sourceTargetType: targetType,
        sourceTargetId,
        killerId: actorId,
        rewardType: spec.rewardType,
      },
    ],
  });

  if (existingBatch) {
    const mergedMemberIds = uniqueStrings([...existingBatch.memberIds, ...memberIds]);

    let changed = false;
    if (existingBatch.sourceMissionId !== sourceMissionId) {
      existingBatch.sourceMissionId = sourceMissionId;
      changed = true;
    }
    if (JSON.stringify(existingBatch.memberIds || []) !== JSON.stringify(mergedMemberIds)) {
      existingBatch.memberIds = mergedMemberIds;
      changed = true;
    }
    if (changed) await existingBatch.save();

    mission.factionRewardBatchId = String(existingBatch._id);
    await mission.save();

    await ensureFactionRewardChatMessage({
      rewardContext,
      batch: existingBatch,
      targetType,
      actorId,
      actorName: String(mission.playerName || existingBatch.killerName || 'Jogador'),
      emit: false,
    });

    return existingBatch;
  }

  const batch = await AzideiaRewardBatch.create({
    factionId: rewardContext.factionId,
    rewardType: spec.rewardType,
    quantityPerMember: spec.quantityPerMember,
    memberIds,
    sourceMissionId,
    sourceTargetType: targetType,
    sourceTargetId,
    killerId: actorId,
    killerName: String(mission.playerName || 'Jogador'),
  });

  mission.factionRewardBatchId = String(batch._id);
  await mission.save();

  await ensureFactionRewardChatMessage({
    rewardContext,
    batch,
    targetType,
    actorId,
    actorName: String(mission.playerName || 'Jogador'),
    emit: false,
  });

  return batch;
}

export async function repairMissingFactionRewardBatchesForPlayer(player, options = {}) {
  const rewardContext = await getFactionRewardContext(player);
  if (!rewardContext || rewardContext.factionAliases.length <= 0) return { repaired: 0 };

  const limit = Math.max(1, Math.min(60, Math.floor(toNumber(options.limit, 25))));
  const memberIds = uniqueStrings(rewardContext.memberIds || []);

  // Reparo leve: só busca missões já resolvidas que ainda NÃO têm lote vinculado.
  // O patch anterior varria missões resolvidas demais e deixava a coleta lenta.
  const missions = await AzideiaMission.find({
    targetType: { $in: ['x9', 'correria', 'mestre_obras'] },
    rewardGrantedAtIso: { $nin: [null, ''] },
    $or: [
      { factionRewardBatchId: null },
      { factionRewardBatchId: '' },
      { factionRewardBatchId: { $exists: false } },
    ],
    $and: [
      {
        $or: [
          { factionId: { $in: rewardContext.factionAliases } },
          ...(memberIds.length > 0 ? [{ playerId: { $in: memberIds } }] : []),
        ],
      },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit);

  let repaired = 0;
  for (const mission of missions) {
    try {
      const batch = await upsertFactionRewardBatchFromResolvedMission({ rewardContext, mission });
      if (batch) repaired += 1;
    } catch (error) {
      console.error('[AZIDEIA_FACTION_REWARD_REPAIR_NON_BLOCKING]', {
        missionId: String(mission?._id || ''),
        error,
      });
    }
  }

  return { repaired };
}

async function reconcileFactionOverdueAzideiaMissionsForPlayer(player, options = {}) {
  const rewardContext = await getFactionRewardContext(player);
  if (!rewardContext || rewardContext.factionAliases.length <= 0) {
    return { changedMissionCount: 0, changedPlayerCount: 0 };
  }

  const limit = Math.max(1, Math.min(40, Math.floor(toNumber(options.limit, 20))));
  const nowMs = Date.now();
  const memberIds = uniqueStrings(rewardContext.memberIds || []);
  if (memberIds.length <= 0) return { changedMissionCount: 0, changedPlayerCount: 0 };

  // Ponto que estava faltando: a coleta de um membro precisa materializar
  // recompensas de missões vencidas feitas por OUTROS membros da facção.
  // Antes só a missão do próprio jogador era reconciliada; se o atacante não
  // confirmasse chegada/retorno, a facção via 0 recompensa.
  const missions = await AzideiaMission.find({
    targetType: { $in: ['x9', 'correria', 'mestre_obras'] },
    status: { $in: ['travelling', 'returning'] },
    $or: [
      { factionId: { $in: rewardContext.factionAliases } },
      { playerId: { $in: memberIds } },
    ],
    $and: [
      {
        $or: [
          { arriveAtIso: { $lte: new Date(nowMs + AZIDEIA_MISSION_GRACE_MS).toISOString() } },
          { returnAtIso: { $lte: new Date(nowMs + AZIDEIA_MISSION_GRACE_MS).toISOString() } },
          { updatedAt: { $lte: new Date(nowMs - AZIDEIA_RESCUE_OVERDUE_MS) } },
        ],
      },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  let changedMissionCount = 0;
  let changedPlayerCount = 0;

  for (const mission of missions) {
    try {
      const missionPlayer = await Player.findById(mission.playerId);
      if (!missionPlayer) continue;

      let missionChanged = false;
      let playerChanged = false;

      if (mission.status === 'travelling') {
        const arrival = await resolveAzideiaMissionArrival({ player: missionPlayer, mission, nowMs });
        missionChanged = missionChanged || arrival.changedMission;
        playerChanged = playerChanged || arrival.changedPlayer;
      }

      if (mission.status === 'returning') {
        const returned = await resolveAzideiaMissionReturn({ player: missionPlayer, mission, nowMs });
        missionChanged = missionChanged || returned.changedMission;
        playerChanged = playerChanged || returned.changedPlayer;
      }

      if (missionChanged) {
        await mission.save();
        changedMissionCount += 1;
      }

      if (playerChanged) {
        if (typeof missionPlayer.markModified === 'function') {
          missionPlayer.markModified('gang');
          missionPlayer.markModified('azideiaDaily');
          missionPlayer.markModified('convoyAccelerators');
          missionPlayer.markModified('barracoAccelerators');
          missionPlayer.markModified('balances');
        }
        bumpVersion(missionPlayer);
        await missionPlayer.save();
        emitPlayerUpdate(missionPlayer);
        changedPlayerCount += 1;
      }
    } catch (error) {
      console.error('[AZIDEIA_FACTION_OVERDUE_RECONCILE_NON_BLOCKING]', {
        missionId: String(mission?._id || ''),
        error,
      });
    }
  }

  return { changedMissionCount, changedPlayerCount };
}

export async function repairMissingFactionRewardChatMessagesForPlayer(player) {
  const rewardContext = await getFactionRewardContext(player);
  const playerId = String(player?._id || '').trim();
  if (!rewardContext || !playerId || rewardContext.factionAliases.length <= 0) return { repaired: 0 };

  const batches = await AzideiaRewardBatch.find({
    factionId: { $in: rewardContext.factionAliases },
    claimedBy: { $ne: playerId },
  })
    .sort({ createdAt: -1 })
    .limit(40);

  let repaired = 0;
  for (const batch of batches) {
    try {
      if (!isPlayerEligibleForFactionBatch(rewardContext, playerId, batch)) continue;
      const result = await ensureFactionRewardChatMessage({
        rewardContext,
        batch,
        targetType: batch.sourceTargetType || 'x9',
        actorId: String(batch.killerId || ''),
        actorName: String(batch.killerName || 'Jogador'),
        emit: false,
      });
      if (result.created) repaired += 1;
    } catch (error) {
      console.error('[AZIDEIA_FACTION_REWARD_CHAT_REPAIR_NON_BLOCKING]', {
        batchId: String(batch?._id || ''),
        error,
      });
    }
  }

  return { repaired };
}

async function getFactionAliasesForPlayer(player) {
  const fallbackFactionId = String(player?.factionId || '').trim();
  const faction = fallbackFactionId
    ? (await findFactionByAnyId(fallbackFactionId)) || (await findFactionByPlayerMembership(player))
    : await findFactionByPlayerMembership(player);
  return uniqueStrings([
    fallbackFactionId,
    faction?.id,
    faction?._id ? String(faction._id) : '',
  ]);
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

function normalizeTarget(target, player = null) {
  const type = target.type || 'x9';
  const config = getTargetConfig(type);
  return {
    id: String(target._id),
    type,
    name: target.name || config.name,
    modelUrl: target.modelUrl || config.modelUrl,
    tileX: clampTile(target.tileX),
    tileY: clampTile(target.tileY),
    costDirtyMoney: getTargetCostDirtyMoney(type, player),
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
    emitAzideiaMapChanged(targetType === 'correria' ? 'correria_negotiated' : targetType === 'mestre_obras' ? 'mestre_obras_paid' : 'x9_killed', {
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
    } else if (targetType === 'mestre_obras') {
      daily.mestreObrasPayments += 1;
    } else {
      daily.x9Kills += 1;
    }

    try {
      factionReward = targetType === 'correria'
        ? await grantCorreriaRewards({ player, mission })
        : targetType === 'mestre_obras'
          ? await grantMestreObrasRewards({ player, mission })
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
      player.markModified('barracoAccelerators');
      player.markModified('balances');
    }
    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);
  }

  await ensureActiveAzideiaTargets();

  return { changedPlayer, changedMissionCount };
}


async function reconcileAllOverdueAzideiaMissions(limit = 120) {
  const nowMs = Date.now();
  const missions = await AzideiaMission.find({
    status: { $in: ['travelling', 'returning'] },
    $or: [
      { arriveAtIso: { $lte: new Date(nowMs + AZIDEIA_MISSION_GRACE_MS).toISOString() } },
      { returnAtIso: { $lte: new Date(nowMs + AZIDEIA_MISSION_GRACE_MS).toISOString() } },
      { updatedAt: { $lte: new Date(nowMs - AZIDEIA_RESCUE_OVERDUE_MS) } },
    ],
  }).sort({ createdAt: 1 }).limit(limit);

  let changedMissionCount = 0;
  let changedPlayerCount = 0;

  for (const mission of missions) {
    let missionChanged = false;
    let playerChanged = false;

    try {
      const player = await Player.findById(mission.playerId);
      if (!player) {
        mission.status = 'cancelled';
        mission.completedAtIso = mission.completedAtIso || new Date(nowMs).toISOString();
        await mission.save();

        await AzideiaTarget.updateOne(
          { _id: mission.targetId, reservedByMissionId: String(mission._id) },
          {
            $set: {
              reservedByPlayerId: null,
              reservedByMissionId: null,
              reservedAt: null,
            },
          },
        );

        changedMissionCount += 1;
        continue;
      }

      if (mission.status === 'travelling') {
        const arrival = await resolveAzideiaMissionArrival({ player, mission, nowMs });
        playerChanged = playerChanged || arrival.changedPlayer;
        missionChanged = missionChanged || arrival.changedMission;
      }

      if (mission.status === 'returning') {
        const returned = await resolveAzideiaMissionReturn({ player, mission, nowMs });
        playerChanged = playerChanged || returned.changedPlayer;
        missionChanged = missionChanged || returned.changedMission;
      }

      if (missionChanged) {
        await mission.save();
        changedMissionCount += 1;
      }

      if (playerChanged) {
        if (typeof player.markModified === 'function') {
          player.markModified('gang');
          player.markModified('azideiaDaily');
          player.markModified('convoyAccelerators');
          player.markModified('barracoAccelerators');
          player.markModified('balances');
        }
        bumpVersion(player);
        await player.save();
        emitPlayerUpdate(player);
        changedPlayerCount += 1;
      }
    } catch (missionError) {
      console.error('[AZIDEIA_GLOBAL_RECONCILE_NON_BLOCKING]', {
        missionId: String(mission?._id || ''),
        status: mission?.status,
        error: missionError,
      });
    }
  }

  return { changedMissionCount, changedPlayerCount };
}

export async function ensureAzideiaSystemHealth() {
  try {
    const reconciled = await reconcileAllOverdueAzideiaMissions();
    const pool = await ensureActiveAzideiaTargets();

    if (reconciled.changedMissionCount > 0 || reconciled.changedPlayerCount > 0 || pool.created > 0 || pool.cleaned > 0) {
      console.log('[AZIDEIA_HEALTH]', {
        reconciledMissions: reconciled.changedMissionCount,
        reconciledPlayers: reconciled.changedPlayerCount,
        created: pool.created,
        cleaned: pool.cleaned,
        x9Created: pool.x9Created,
        correriaCreated: pool.correriaCreated,
      });
    }

    return { ...reconciled, ...pool };
  } catch (error) {
    console.error('[AZIDEIA_HEALTH_ERROR]', error);
    return { error: error?.message || 'azideia_health_error' };
  }
}


function getActiveGangMembers(player) {
  return Array.isArray(player?.gang?.members)
    ? player.gang.members.filter((member) => member?.status === 'ativo')
    : [];
}

async function getActiveAzideiaMissionCounts(playerId) {
  const [total, travelling, travellingX9, travellingCorreria, travellingMestreObras] = await Promise.all([
    AzideiaMission.countDocuments({ playerId: String(playerId), status: { $in: ['travelling', 'returning'] } }),
    AzideiaMission.countDocuments({ playerId: String(playerId), status: 'travelling' }),
    AzideiaMission.countDocuments({ playerId: String(playerId), status: 'travelling', targetType: 'x9' }),
    AzideiaMission.countDocuments({ playerId: String(playerId), status: 'travelling', targetType: 'correria' }),
    AzideiaMission.countDocuments({ playerId: String(playerId), status: 'travelling', targetType: 'mestre_obras' }),
  ]);
  return { total, travelling, travellingX9, travellingCorreria, travellingMestreObras };
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
    type: { $in: Object.keys(AZIDEIA_TARGETS) },
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
  const mestreObras = await ensureActiveTargetPool('mestre_obras', AZIDEIA_MESTRE_OBRAS);
  const created = x9.created + correria.created + mestreObras.created;

  if (cleaned > 0 || created > 0) {
    emitAzideiaMapChanged('ensure_target_pool', {
      cleaned,
      created,
      x9Created: x9.created,
      correriaCreated: correria.created,
      mestreObrasCreated: mestreObras.created,
      x9ActiveCount: AZIDEIA_X9.activeCount,
      correriaActiveCount: AZIDEIA_CORRERIA.activeCount,
      mestreObrasActiveCount: AZIDEIA_MESTRE_OBRAS.activeCount,
    });
  }

  return { cleaned, created, x9Created: x9.created, correriaCreated: correria.created, mestreObrasCreated: mestreObras.created };
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

function buildDailyEnvelope(player, travellingReservations = 0, correriaTravellingReservations = 0, mestreObrasTravellingReservations = 0) {
  const daily = ensureAzideiaDaily(player);
  const dailyKills = Math.max(0, Math.floor(toNumber(daily.x9Kills, 0)));
  const dailyCorreriaNegotiations = Math.max(0, Math.floor(toNumber(daily.correriaNegotiations, 0)));
  const dailyMestreObrasPayments = Math.max(0, Math.floor(toNumber(daily.mestreObrasPayments, 0)));
  const reserved = Math.max(0, Math.floor(toNumber(travellingReservations, 0)));
  const correriaReserved = Math.max(0, Math.floor(toNumber(correriaTravellingReservations, 0)));
  const mestreObrasReserved = Math.max(0, Math.floor(toNumber(mestreObrasTravellingReservations, 0)));
  return {
    dailyKills,
    dailyLimit: AZIDEIA_X9.dailyLimitPerPlayer,
    remainingToday: Math.max(0, AZIDEIA_X9.dailyLimitPerPlayer - dailyKills - reserved),
    dailyCorreriaNegotiations,
    correriaDailyLimit: AZIDEIA_CORRERIA.dailyLimitPerPlayer,
    correriaRemainingToday: Math.max(0, AZIDEIA_CORRERIA.dailyLimitPerPlayer - dailyCorreriaNegotiations - correriaReserved),
    dailyMestreObrasPayments,
    mestreObrasDailyLimit: AZIDEIA_MESTRE_OBRAS.dailyLimitPerPlayer,
    mestreObrasRemainingToday: Math.max(0, AZIDEIA_MESTRE_OBRAS.dailyLimitPerPlayer - dailyMestreObrasPayments - mestreObrasReserved),
    mestreObrasCostDirtyMoney: getTargetCostDirtyMoney('mestre_obras', player),
    x9FactionReceivedToday: normalizeX9FactionRewardCap(daily.x9FactionAcceleratorsReceived),
    x9FactionDailyLimit: AZIDEIA_X9.factionDailyRewardLimit,
    correriaFactionReceivedToday: normalizeCorreriaFactionRewardCap(daily.correriaFactionCorreReceived),
    correriaFactionDailyLimit: AZIDEIA_CORRERIA.factionDailyRewardLimit,
    mestreObrasFactionReceivedToday: normalizeMestreObrasFactionRewardCap(daily.mestreObrasFactionBarracoAcceleratorsReceived),
    mestreObrasFactionDailyLimit: AZIDEIA_MESTRE_OBRAS.factionDailyRewardLimit,
  };
}

export async function getAzideiaTargets(req, res) {
  try {
    if (req.player) await reconcileAzideiaMissionsForPlayer(req.player);
    await ensureActiveAzideiaTargets();
    const [x9Targets, correriaTargets, mestreObrasTargets] = await Promise.all([
      getVisibleTargetsForType('x9', AZIDEIA_X9, AVAILABLE_X9_QUERY),
      getVisibleTargetsForType('correria', AZIDEIA_CORRERIA, AVAILABLE_CORRERIA_QUERY),
      getVisibleTargetsForType('mestre_obras', AZIDEIA_MESTRE_OBRAS, AVAILABLE_MESTRE_OBRAS_QUERY),
    ]);

    const activeCounts = await getActiveAzideiaMissionCounts(req.player._id);
    const daily = buildDailyEnvelope(
      req.player,
      activeCounts.travellingX9,
      activeCounts.travellingCorreria,
      activeCounts.travellingMestreObras,
    );
    return res.json({
      targets: [...x9Targets, ...correriaTargets, ...mestreObrasTargets].map((target) => normalizeTarget(target, req.player)),
      x9Targets: x9Targets.map((target) => normalizeTarget(target, req.player)),
      correriaTargets: correriaTargets.map((target) => normalizeTarget(target, req.player)),
      mestreObrasTargets: mestreObrasTargets.map((target) => normalizeTarget(target, req.player)),
      costDirtyMoney: AZIDEIA_X9.costDirtyMoney,
      correriaCostDirtyMoney: AZIDEIA_CORRERIA.costDirtyMoney,
      mestreObrasCostDirtyMoney: getTargetCostDirtyMoney('mestre_obras', req.player),
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
    const daily = buildDailyEnvelope(req.player, activeCounts.travellingX9, activeCounts.travellingCorreria, activeCounts.travellingMestreObras);
    return res.json({
      targets: targets.map((target) => normalizeTarget(target, req.player)),
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
        ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria, activeCounts.travellingMestreObras),
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
      ...buildDailyEnvelope(player, activeCounts.travellingX9 + 1, activeCounts.travellingCorreria, activeCounts.travellingMestreObras),
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

  return createFactionClaimableRewardSafely({
    player,
    mission,
    targetType: 'x9',
  });
}

function normalizeX9FactionRewardCap(value) {
  return Math.min(AZIDEIA_X9.factionDailyRewardLimit, Math.max(0, Math.floor(toNumber(value, 0))));
}

function normalizeCorreriaFactionRewardCap(value) {
  return Math.min(AZIDEIA_CORRERIA.factionDailyRewardLimit, Math.max(0, Math.floor(toNumber(value, 0))));
}

function normalizeMestreObrasFactionRewardCap(value) {
  return Math.min(AZIDEIA_MESTRE_OBRAS.factionDailyRewardLimit, Math.max(0, Math.floor(toNumber(value, 0))));
}

async function grantCorreriaRewards({ player, mission }) {
  // Recompensa imediata do jogador que negociou: +1 Corre.
  // Recompensa de facção: lote pendente para TODOS os membros coletarem no chat.
  player.balances = player.balances || {};
  player.balances.corre = Math.max(0, Math.floor(toNumber(player.balances.corre, 0))) + AZIDEIA_CORRERIA.rewardQuantity;

  return createFactionClaimableRewardSafely({
    player,
    mission,
    targetType: 'correria',
  });
}

async function grantMestreObrasRewards({ player, mission }) {
  // Recompensa imediata: 1h + 1min para acelerar evolução do barraco.
  // Recompensa de facção: lote pendente para TODOS os membros coletarem no chat.
  const barracoAccelerators = ensureBarracoAccelerators(player);
  const rewardSeconds = Math.max(0, Math.floor(toNumber(
    AZIDEIA_MESTRE_OBRAS.rewardQuantitySeconds,
    AZIDEIA_MESTRE_OBRAS.rewardQuantity,
  )));
  barracoAccelerators.seconds += rewardSeconds;

  return createFactionClaimableRewardSafely({
    player,
    mission,
    targetType: 'mestre_obras',
  });
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
        ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria, activeCounts.travellingMestreObras),
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
      ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria + 1, activeCounts.travellingMestreObras),
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_NEGOTIATE_CORRERIA]', error);
    return res.status(500).json({ error: 'Erro ao negociar com Correria' });
  }
}

export async function payMestreObras(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const targetId = String(req.params?.targetId || req.body?.targetId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Mestre de Obras inválido', reason: 'invalid_target_id' });
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
        error: 'Você precisa de pelo menos 1 membro ativo da gangue para enviar o comboio ao Mestre de Obras.',
        reason: 'no_active_gang_member',
      });
    }

    const daily = ensureAzideiaDaily(player);
    if (daily.mestreObrasPayments + activeCounts.travellingMestreObras >= AZIDEIA_MESTRE_OBRAS.dailyLimitPerPlayer) {
      return res.status(429).json({
        error: 'Limite diário de Mestre de Obras atingido.',
        reason: 'daily_limit_reached',
        ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria, activeCounts.travellingMestreObras),
      });
    }

    player.balances = player.balances || {};
    const dirtyMoney = toNumber(player.balances.dirtyMoney, 0);
    const costDirtyMoney = getTargetCostDirtyMoney('mestre_obras', player);
    if (dirtyMoney < costDirtyMoney) {
      return res.status(400).json({
        error: 'Commands sujo insuficiente para pagar o Mestre de Obras.',
        reason: 'insufficient_dirty_money',
        costDirtyMoney,
        currentDirtyMoney: dirtyMoney,
      });
    }

    const reservationKey = `pending:${String(player._id)}:${Date.now()}`;
    const target = await AzideiaTarget.findOneAndUpdate(
      {
        _id: targetId,
        type: 'mestre_obras',
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
      return res.status(409).json({ error: 'Esse Mestre de Obras já foi pago por outro comboio.', reason: 'target_already_reserved' });
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

    player.balances.dirtyMoney = Math.max(0, dirtyMoney - costDirtyMoney);

    const mission = await AzideiaMission.create({
      playerId: String(player._id),
      playerName: String(player.name || 'Jogador'),
      factionId: player.factionId ? String(player.factionId) : null,
      targetId: String(target._id),
      targetType: 'mestre_obras',
      targetName: target.name || AZIDEIA_MESTRE_OBRAS.name,
      targetModelUrl: target.modelUrl || AZIDEIA_MESTRE_OBRAS.modelUrl,
      targetTileX: clampTile(target.tileX),
      targetTileY: clampTile(target.tileY),
      originTileX,
      originTileY,
      routeTiles,
      returnRouteTiles,
      travelDurationMs,
      returnDurationMs,
      costDirtyMoney,
      rewardType: AZIDEIA_MESTRE_OBRAS.rewardType,
      rewardQuantity: AZIDEIA_MESTRE_OBRAS.rewardQuantitySeconds,
      selectedGangMemberId: selectedMember?.id || null,
      status: 'travelling',
      launchedAtIso: new Date(launchedAt).toISOString(),
      arriveAtIso,
      returnAtIso,
    });

    target.reservedByMissionId = String(mission._id);
    target.reservedAt = new Date(launchedAt).toISOString();
    await target.save();
    emitAzideiaMapChanged('mestre_obras_reserved', { targetId: String(target._id), missionId: String(mission._id), targetType: 'mestre_obras' });
    emitAzideiaMissionChanged('mission_started', mission);
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
      targetType: 'mestre_obras',
      costDirtyMoney,
      immediateReward: null,
      factionReward: null,
      activeAzideiaConvoys: activeCounts.total + 1,
      maxParallelAzideiaConvoys: MAX_PARALLEL_AZIDEIA_CONVOYS,
      ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria, activeCounts.travellingMestreObras + 1),
      player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
    });
  } catch (error) {
    console.error('[AZIDEIA_PAY_MESTRE_OBRAS]', error);
    return res.status(500).json({ error: 'Erro ao pagar Mestre de Obras' });
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
      player.markModified('barracoAccelerators');
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
      ...buildDailyEnvelope(player, activeCounts.travellingX9, activeCounts.travellingCorreria, activeCounts.travellingMestreObras),
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
      player.markModified('barracoAccelerators');
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
  const playerId = String(player?._id || '').trim();
  if (!playerId) return [];

  const rewardContext = await getFactionRewardContext(player);
  const factionAliases = uniqueStrings([
    player?.factionId,
    ...(rewardContext?.factionAliases || []),
  ]);

  const [directBatches, factionBatches] = await Promise.all([
    AzideiaRewardBatch.find({
      memberIds: playerId,
      claimedBy: { $ne: playerId },
    }).sort({ createdAt: 1 }).limit(300),
    rewardContext && factionAliases.length > 0
      ? AzideiaRewardBatch.find({
          factionId: { $in: factionAliases },
          claimedBy: { $ne: playerId },
        }).sort({ createdAt: 1 }).limit(300)
      : Promise.resolve([]),
  ]);

  const byId = new Map();

  for (const batch of directBatches) {
    byId.set(String(batch._id), batch);
  }

  if (rewardContext) {
    for (const batch of factionBatches) {
      const batchId = String(batch._id);
      if (byId.has(batchId)) continue;
      if (!isPlayerEligibleForFactionBatch(rewardContext, playerId, batch)) continue;
      byId.set(batchId, batch);
    }
  }

  return Array.from(byId.values()).sort((a, b) => {
    const aMs = getBatchCreatedMs(a) || 0;
    const bMs = getBatchCreatedMs(b) || 0;
    return aMs - bMs;
  });
}

function getX9ClaimRemainingToday(player) {
  const daily = ensureAzideiaDaily(player);
  const already = normalizeX9FactionRewardCap(daily.x9FactionAcceleratorsReceived);
  return Math.max(0, AZIDEIA_X9.factionDailyRewardLimit - already);
}

function getCorreriaClaimRemainingToday(player) {
  const daily = ensureAzideiaDaily(player);
  const already = normalizeCorreriaFactionRewardCap(daily.correriaFactionCorreReceived);
  return Math.max(0, AZIDEIA_CORRERIA.factionDailyRewardLimit - already);
}

function getMestreObrasClaimRemainingToday(player) {
  const daily = ensureAzideiaDaily(player);
  const already = normalizeMestreObrasFactionRewardCap(daily.mestreObrasFactionBarracoAcceleratorsReceived);
  return Math.max(0, AZIDEIA_MESTRE_OBRAS.factionDailyRewardLimit - already);
}

function normalizeBatchRewardType(batch) {
  if (batch.rewardType === 'corre') return 'corre';
  if (batch.rewardType === 'barraco_time' || batch.sourceTargetType === 'mestre_obras') return 'barraco_time';
  return 'convoy_2x';
}

function summarizeRewardBatches(player, batches) {
  let x9Remaining = getX9ClaimRemainingToday(player);
  let correRemaining = getCorreriaClaimRemainingToday(player);
  let mestreObrasRemaining = getMestreObrasClaimRemainingToday(player);
  const available = { convoy_2x: 0, corre: 0, barraco_time: 0 };

  for (const batch of batches) {
    const rewardType = normalizeBatchRewardType(batch);
    const quantity = Math.max(0, Math.floor(toNumber(batch.quantityPerMember, 1)));
    if (quantity <= 0) continue;

    if (rewardType === 'corre') {
      const allowed = Math.min(quantity, correRemaining);
      available.corre += allowed;
      correRemaining -= allowed;
    } else if (rewardType === 'barraco_time') {
      // Cada lote de Mestre de Obras vale 1 acelerador de 5 minutos por membro.
      // O limite diário é em quantidade de aceleradores, não em segundos.
      if (mestreObrasRemaining > 0) {
        available.barraco_time += quantity;
        mestreObrasRemaining -= 1;
      }
    } else {
      const allowed = Math.min(quantity, x9Remaining);
      available.convoy_2x += allowed;
      x9Remaining -= allowed;
    }
  }

  const daily = ensureAzideiaDaily(player);
  return {
    available,
    totalAvailable: available.convoy_2x + available.corre + available.barraco_time,
    x9FactionReceivedToday: normalizeX9FactionRewardCap(daily.x9FactionAcceleratorsReceived),
    x9FactionDailyLimit: AZIDEIA_X9.factionDailyRewardLimit,
    correriaFactionReceivedToday: normalizeCorreriaFactionRewardCap(daily.correriaFactionCorreReceived),
    correriaFactionDailyLimit: AZIDEIA_CORRERIA.factionDailyRewardLimit,
    mestreObrasFactionReceivedToday: normalizeMestreObrasFactionRewardCap(daily.mestreObrasFactionBarracoAcceleratorsReceived),
    mestreObrasFactionDailyLimit: AZIDEIA_MESTRE_OBRAS.factionDailyRewardLimit,
    batches: batches.map(normalizeRewardBatch),
  };
}

export async function getMyAzideiaRewards(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    await reconcileAzideiaMissionsForPlayer(player);
    await reconcileFactionOverdueAzideiaMissionsForPlayer(player, { limit: 20 });
    await repairMissingFactionRewardBatchesForPlayer(player, { limit: 25 });

    const batches = await getPendingBatchesForPlayer(player);
    const factionAliases = await getFactionAliasesForPlayer(player);
    return res.json({
      factionId: factionAliases[0] || player.factionId || null,
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

    await reconcileAzideiaMissionsForPlayer(player);
    await reconcileFactionOverdueAzideiaMissionsForPlayer(player, { limit: 20 });
    await repairMissingFactionRewardBatchesForPlayer(player, { limit: 25 });

    const batches = await getPendingBatchesForPlayer(player);
    const playerId = String(player._id);
    const claimed = { convoy_2x: 0, corre: 0, barraco_time: 0 };
    let x9Remaining = getX9ClaimRemainingToday(player);
    let correRemaining = getCorreriaClaimRemainingToday(player);
    let mestreObrasRemaining = getMestreObrasClaimRemainingToday(player);

    player.balances = player.balances || {};
    const convoyAccelerators = ensureConvoyAccelerators(player);
    const barracoAccelerators = ensureBarracoAccelerators(player);
    const daily = ensureAzideiaDaily(player);

    for (const batch of batches) {
      if (batch.claimedBy.includes(playerId)) continue;

      const rewardType = normalizeBatchRewardType(batch);
      const quantity = Math.max(0, Math.floor(toNumber(batch.quantityPerMember, 1)));
      if (quantity <= 0) continue;

      if (rewardType === 'corre') {
        const grant = Math.min(quantity, correRemaining);
        if (grant <= 0) continue;

        player.balances.corre = Math.max(0, Math.floor(toNumber(player.balances.corre, 0))) + grant;
        daily.correriaFactionCorreReceived = normalizeCorreriaFactionRewardCap(daily.correriaFactionCorreReceived + grant);
        correRemaining -= grant;
        claimed.corre += grant;
      } else if (rewardType === 'barraco_time') {
        if (mestreObrasRemaining <= 0) continue;

        barracoAccelerators.seconds += quantity;
        daily.mestreObrasFactionBarracoAcceleratorsReceived = normalizeMestreObrasFactionRewardCap(
          daily.mestreObrasFactionBarracoAcceleratorsReceived + 1,
        );
        mestreObrasRemaining -= 1;
        claimed.barraco_time += quantity;
      } else {
        const grant = Math.min(quantity, x9Remaining);
        if (grant <= 0) continue;

        convoyAccelerators.twoX += grant;
        daily.x9FactionAcceleratorsReceived = normalizeX9FactionRewardCap(daily.x9FactionAcceleratorsReceived + grant);
        x9Remaining -= grant;
        claimed.convoy_2x += grant;
      }

      batch.claimedBy.push(playerId);
      await batch.save();
    }

    const totalClaimed = claimed.convoy_2x + claimed.corre + claimed.barraco_time;
    if (totalClaimed > 0) {
      if (typeof player.markModified === 'function') {
        player.markModified('convoyAccelerators');
        player.markModified('barracoAccelerators');
        player.markModified('balances');
        player.markModified('azideiaDaily');
      }
      bumpVersion(player);
      await player.save();
      emitPlayerUpdate(player);
    }

    const remainingBatches = await getPendingBatchesForPlayer(player);
    const factionAliases = await getFactionAliasesForPlayer(player);
    return res.json({
      factionId: factionAliases[0] || player.factionId || null,
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
