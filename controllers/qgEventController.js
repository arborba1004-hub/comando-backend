import QgEvent from '../models/QgEvent.js';
import Faction from '../models/Faction.js';
import Player from '../models/Player.js';
import { bumpVersion, generateId } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { emitToPlayer, emitToPlayers, broadcastToAll } from '../services/socketEmitter.js';
import {
  QG_EVENT,
  QG_EVENT_ACTIONS,
  QG_OFFICE_TITLES,
  QG_WINNER_STAT_SOURCE,
  getQGEventPhase,
  getQGIndividualReward,
  getQGFactionReward,
} from '../data/qgEventCatalog.js';
import { buildGangStatSnapshot } from '../services/gangStatisticsService.js';

function nowIso() {
  return new Date().toISOString();
}

function nowMs() {
  return Date.now();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function getPlayerId(player) {
  return String(player?._id || '');
}

function getBarracoLevel(player) {
  return clamp(Math.floor(toNumber(player?.niveis?.barracoLevel, 1)), 1, 100);
}

async function findFactionForPlayer(player) {
  const playerId = getPlayerId(player);
  const storedFactionId = String(player?.factionId || '').trim();

  const membershipFaction = playerId
    ? await Faction.findOne({ 'members.playerId': playerId })
    : null;

  if (membershipFaction) {
    if (String(player.factionId || '') !== String(membershipFaction.id || '')) {
      player.factionId = String(membershipFaction.id || '');
      bumpVersion(player);
      await player.save();
      emitToPlayer(playerId, 'playerUpdate', { player: mergePlayerState(player.toObject()) });
    }
    return membershipFaction;
  }

  if (!storedFactionId) return null;

  return Faction.findOne({
    $or: [
      { id: storedFactionId },
      { _id: storedFactionId.match(/^[a-f0-9]{24}$/i) ? storedFactionId : undefined },
    ].filter((item) => item._id !== undefined),
  });
}

function getFactionMember(faction, playerId) {
  return Array.isArray(faction?.members)
    ? faction.members.find((member) => String(member.playerId) === String(playerId))
    : null;
}

function canStartQGEvent(faction, playerId) {
  const member = getFactionMember(faction, playerId);
  if (!member) return false;
  if (member.role === 'leader' || member.role === 'subleader') return true;
  return Boolean(member.permissions?.canStartEvents);
}

function ensureEventActivityLog(event) {
  if (!Array.isArray(event.activityLog)) event.activityLog = [];
  return event.activityLog;
}

function addEventLog(event, type, actor = {}, metadata = {}) {
  ensureEventActivityLog(event).push({
    id: generateId(),
    type,
    actorPlayerId: String(actor.playerId || actor._id || ''),
    actorPlayerName: String(actor.playerName || actor.name || 'Jogador'),
    metadata,
    createdAt: nowIso(),
  });
}

function ensureParticipant(event, player, faction) {
  const playerId = getPlayerId(player);
  const factionId = String(faction?.id || player?.factionId || '');
  let participant = event.participants.find((item) => String(item.playerId) === playerId);

  if (!participant) {
    participant = {
      playerId,
      playerName: player.name || 'Jogador',
      avatar: player.avatar || '',
      factionId,
      factionName: faction?.name || '',
      factionTag: faction?.tag || '',
      score: 0,
      heat: 0,
      actions: {},
      cooldowns: {},
      joinedAt: nowIso(),
      lastActionAt: null,
      rewardClaimedAt: null,
      reward: null,
    };
    event.participants.push(participant);
    addEventLog(event, 'participant_joined', { playerId, playerName: player.name }, { factionId });
  }

  return participant;
}

function recalculateEventFactions(event) {
  const map = new Map();

  for (const participant of event.participants || []) {
    const factionId = String(participant.factionId || '');
    if (!factionId) continue;
    const current = map.get(factionId) || {
      factionId,
      factionName: String(participant.factionName || ''),
      factionTag: String(participant.factionTag || ''),
      score: 0,
      heat: 0,
      participants: 0,
      lastActionAt: null,
    };
    current.score += Math.max(0, toNumber(participant.score, 0));
    current.heat += Math.max(0, toNumber(participant.heat, 0));
    current.participants += 1;
    if (participant.lastActionAt) current.lastActionAt = participant.lastActionAt;
    map.set(factionId, current);
  }

  event.factions = [...map.values()].sort((a, b) => b.score - a.score);
  return event.factions;
}

async function getActiveOrLatestEvent() {
  const active = await QgEvent.findOne({ slug: QG_EVENT.slug, status: 'active' }).sort({ startsAt: -1 });
  if (active) return active;
  return QgEvent.findOne({ slug: QG_EVENT.slug }).sort({ startsAt: -1 });
}

async function getActiveEventOnly() {
  return QgEvent.findOne({ slug: QG_EVENT.slug, status: 'active' }).sort({ startsAt: -1 });
}

function normalizeReward(reward = {}) {
  return {
    cleanMoney: Math.max(0, Math.floor(toNumber(reward.cleanMoney, 0))),
    dirtyMoney: Math.max(0, Math.floor(toNumber(reward.dirtyMoney, 0))),
    corre: Math.max(0, Math.floor(toNumber(reward.corre, 0))),
    battlePrestige: Math.max(0, Math.floor(toNumber(reward.battlePrestige, 0))),
    barracoAcceleratorSeconds: Math.max(0, Math.floor(toNumber(reward.barracoAcceleratorSeconds, 0))),
    convoyAcceleratorTwoX: Math.max(0, Math.floor(toNumber(reward.convoyAcceleratorTwoX, 0))),
  };
}

function normalizeParticipant(participant, rank = 999) {
  return {
    playerId: String(participant.playerId || ''),
    playerName: String(participant.playerName || 'Jogador'),
    avatar: String(participant.avatar || ''),
    factionId: String(participant.factionId || ''),
    factionName: String(participant.factionName || ''),
    factionTag: String(participant.factionTag || ''),
    score: Math.max(0, Math.floor(toNumber(participant.score, 0))),
    heat: Math.max(0, Math.floor(toNumber(participant.heat, 0))),
    actions: participant.actions || {},
    cooldowns: participant.cooldowns || {},
    joinedAt: participant.joinedAt || null,
    lastActionAt: participant.lastActionAt || null,
    rewardClaimedAt: participant.rewardClaimedAt || null,
    reward: participant.reward ? normalizeReward(participant.reward) : null,
    rank,
  };
}

function normalizeEvent(event, currentPlayerId = null) {
  if (!event) return null;
  const phase = event.status === 'active'
    ? getQGEventPhase(nowMs(), event)
    : 'finished';

  const sortedParticipants = [...(event.participants || [])]
    .sort((a, b) => toNumber(b.score, 0) - toNumber(a.score, 0));

  const myParticipantIndex = currentPlayerId
    ? sortedParticipants.findIndex((participant) => String(participant.playerId) === String(currentPlayerId))
    : -1;

  return {
    id: String(event._id),
    slug: event.slug,
    status: event.status,
    phase,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    settledAt: event.settledAt,
    winnerFactionId: event.winnerFactionId,
    winnerFactionName: event.winnerFactionName,
    winnerFactionTag: event.winnerFactionTag,
    leaderboard: (event.factions || []).map((item, index) => ({
      rank: index + 1,
      factionId: String(item.factionId || ''),
      factionName: String(item.factionName || ''),
      factionTag: String(item.factionTag || ''),
      score: Math.max(0, Math.floor(toNumber(item.score, 0))),
      heat: Math.max(0, Math.floor(toNumber(item.heat, 0))),
      participants: Math.max(0, Math.floor(toNumber(item.participants, 0))),
      lastActionAt: item.lastActionAt || null,
    })),
    topParticipants: sortedParticipants.slice(0, 12).map((participant, index) => normalizeParticipant(participant, index + 1)),
    myParticipant: myParticipantIndex >= 0
      ? normalizeParticipant(sortedParticipants[myParticipantIndex], myParticipantIndex + 1)
      : null,
    activityLog: Array.isArray(event.activityLog) ? event.activityLog.slice(-25).reverse() : [],
    rewardSummary: event.rewardSummary || {},
  };
}

function buildStatePayload({ event, player, faction }) {
  const playerId = getPlayerId(player);
  const member = getFactionMember(faction, playerId);
  const barracoLevel = getBarracoLevel(player);
  const active = event?.status === 'active';
  const phase = event ? normalizeEvent(event, playerId)?.phase : null;

  return {
    ok: true,
    config: {
      ...QG_EVENT,
      actions: Object.values(QG_EVENT_ACTIONS),
      officeTitles: QG_OFFICE_TITLES,
      winnerBuff: QG_WINNER_STAT_SOURCE.percent,
    },
    eligibility: {
      hasFaction: Boolean(faction),
      factionId: faction?.id || null,
      factionName: faction?.name || null,
      factionTag: faction?.tag || null,
      role: member?.role || null,
      canStart: Boolean(faction && canStartQGEvent(faction, playerId) && barracoLevel >= QG_EVENT.minBarracoLevel),
      canJoin: Boolean(active && faction && barracoLevel >= QG_EVENT.minBarracoLevel),
      barracoLevel,
      minBarracoLevel: QG_EVENT.minBarracoLevel,
      reason: !faction
        ? 'Você precisa estar em uma facção para disputar o QG.'
        : barracoLevel < QG_EVENT.minBarracoLevel
          ? `Barraco nível ${QG_EVENT.minBarracoLevel}+ necessário.`
          : null,
    },
    event: normalizeEvent(event, playerId),
    phase,
  };
}

async function emitEventUpdate(event) {
  recalculateEventFactions(event);
  const payload = { event: normalizeEvent(event), config: { actions: Object.values(QG_EVENT_ACTIONS) } };
  broadcastToAll('qg:eventUpdated', payload);
}

function ensurePlayerRewardContainers(player) {
  if (!player.balances) player.balances = { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
  if (!player.inventory) player.inventory = { items: [], gifts: [], rewards: [] };
  if (!Array.isArray(player.inventory.rewards)) player.inventory.rewards = [];
  if (!player.convoyAccelerators) player.convoyAccelerators = { twoX: 0 };
  if (!player.barracoAccelerators) player.barracoAccelerators = { seconds: 0 };
  if (!player.gang) player.gang = { members: [], trainingSlots: [], stats: {}, statSources: [] };
  if (!Array.isArray(player.gang.statSources)) player.gang.statSources = [];
}

function addOrReplaceStatSource(player, source) {
  ensurePlayerRewardContainers(player);
  const index = player.gang.statSources.findIndex((item) => String(item.id) === String(source.id));
  if (index >= 0) player.gang.statSources[index] = source;
  else player.gang.statSources.push(source);
  player.gang.statSnapshot = buildGangStatSnapshot(player.gang.members || [], player.gang.statSources);
  player.gang.updatedAtIso = nowIso();
  if (typeof player.markModified === 'function') player.markModified('gang');
}

function applyIndividualReward(player, reward, eventId) {
  ensurePlayerRewardContainers(player);
  const safe = normalizeReward(reward);

  player.balances.cleanMoney = Math.max(0, toNumber(player.balances.cleanMoney, 0)) + safe.cleanMoney;
  player.balances.dirtyMoney = Math.max(0, toNumber(player.balances.dirtyMoney, 0)) + safe.dirtyMoney;
  player.balances.corre = Math.max(0, toNumber(player.balances.corre, 0)) + safe.corre;
  player.battlePrestige = Math.max(0, Math.floor(toNumber(player.battlePrestige, 0))) + safe.battlePrestige;
  player.barracoAccelerators.seconds = Math.max(0, Math.floor(toNumber(player.barracoAccelerators.seconds, 0))) + safe.barracoAcceleratorSeconds;
  player.convoyAccelerators.twoX = Math.max(0, Math.floor(toNumber(player.convoyAccelerators.twoX, 0))) + safe.convoyAcceleratorTwoX;

  player.inventory.rewards.push({
    id: `tomada_qg_reward_${eventId}_${Date.now()}`,
    type: 'event_reward',
    source: 'tomada_qg',
    name: 'Recompensa da Tomada do QG',
    reward: safe,
    createdAt: nowIso(),
  });

  player.markModified?.('balances');
  player.markModified?.('inventory');
  player.markModified?.('convoyAccelerators');
  player.markModified?.('barracoAccelerators');
  bumpVersion(player);

  return safe;
}

async function grantWinnerFactionBuff(event, winnerFaction) {
  const now = Date.now();
  const expiresAt = new Date(now + QG_EVENT.winnerBuffDurationMs).toISOString();
  const statSourceId = `${QG_WINNER_STAT_SOURCE.idPrefix}_${String(event._id)}`;
  const memberIds = uniqueStrings((winnerFaction.members || []).map((member) => member.playerId));

  const factionBuff = {
    id: statSourceId,
    name: 'Mandato do QG',
    type: 'tomada_qg_winner',
    value: 1,
    startedAt: nowIso(),
    endsAt: expiresAt,
  };

  if (!Array.isArray(winnerFaction.activeBuffs)) winnerFaction.activeBuffs = [];
  winnerFaction.activeBuffs = winnerFaction.activeBuffs.filter((buff) => String(buff.type) !== 'tomada_qg_winner');
  winnerFaction.activeBuffs.push(factionBuff);

  const factionReward = getQGFactionReward(event.factions?.[0]?.score || 0, memberIds.length);
  if (!winnerFaction.treasury) winnerFaction.treasury = { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
  winnerFaction.treasury.cleanMoney = Math.max(0, toNumber(winnerFaction.treasury.cleanMoney, 0)) + factionReward.treasury.cleanMoney;
  winnerFaction.treasury.dirtyMoney = Math.max(0, toNumber(winnerFaction.treasury.dirtyMoney, 0)) + factionReward.treasury.dirtyMoney;
  winnerFaction.treasury.corre = Math.max(0, toNumber(winnerFaction.treasury.corre, 0)) + factionReward.treasury.corre;
  winnerFaction.exp = Math.max(0, toNumber(winnerFaction.exp, 0)) + factionReward.factionExp;

  if (!Array.isArray(winnerFaction.activityLog)) winnerFaction.activityLog = [];
  winnerFaction.activityLog.push({
    id: generateId(),
    type: 'territory_won',
    actorPlayerId: event.startedByPlayerId || '',
    actorPlayerName: event.startedByPlayerName || 'QG',
    metadata: {
      eventId: String(event._id),
      eventName: QG_EVENT.title,
      buff: factionBuff,
      reward: factionReward,
    },
    createdAt: nowIso(),
  });

  winnerFaction.markModified?.('activeBuffs');
  winnerFaction.markModified?.('treasury');
  winnerFaction.markModified?.('activityLog');
  await winnerFaction.save();

  const players = await Player.find({ _id: { $in: memberIds } });
  const source = {
    id: statSourceId,
    source: QG_WINNER_STAT_SOURCE.source,
    label: `Mandato do QG - ${winnerFaction.tag || winnerFaction.name}`,
    targetScope: QG_WINNER_STAT_SOURCE.targetScope,
    targetType: null,
    targetMemberId: null,
    percent: QG_WINNER_STAT_SOURCE.percent,
    flat: QG_WINNER_STAT_SOURCE.flat,
    enabled: true,
    expiresAt,
    updatedAtIso: nowIso(),
  };

  for (const player of players) {
    addOrReplaceStatSource(player, source);
    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });
  }

  emitToPlayers(memberIds, 'qg:mandatoWon', () => ({
    eventId: String(event._id),
    factionId: winnerFaction.id,
    factionName: winnerFaction.name,
    factionTag: winnerFaction.tag,
    buff: source,
    expiresAt,
  }));

  return { factionReward, affectedMembers: players.length, buff: source };
}

async function settleEventIfNeeded(event, force = false) {
  if (!event || event.status !== 'active') return event;
  const shouldSettle = force || Date.now() >= new Date(event.endsAt).getTime();
  if (!shouldSettle) return event;

  recalculateEventFactions(event);
  const leaderboard = event.factions || [];
  const winner = leaderboard[0] || null;

  event.status = 'settled';
  event.phase = 'finished';
  event.settledAt = nowIso();
  event.winnerFactionId = winner?.factionId || null;
  event.winnerFactionName = winner?.factionName || '';
  event.winnerFactionTag = winner?.factionTag || '';

  const sortedParticipants = [...(event.participants || [])]
    .sort((a, b) => toNumber(b.score, 0) - toNumber(a.score, 0));

  const rewardSummary = {
    participantRewards: 0,
    winnerBuff: null,
    factionReward: null,
  };

  for (let index = 0; index < sortedParticipants.length; index += 1) {
    const participant = sortedParticipants[index];
    if (participant.rewardClaimedAt) continue;
    const player = await Player.findById(participant.playerId);
    if (!player) continue;
    const reward = getQGIndividualReward(participant.score, index + 1);
    participant.reward = applyIndividualReward(player, reward, String(event._id));
    participant.rewardClaimedAt = nowIso();
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });
    rewardSummary.participantRewards += 1;
  }

  if (winner?.factionId) {
    const winnerFaction = await Faction.findOne({ id: String(winner.factionId) });
    if (winnerFaction) {
      const winnerResult = await grantWinnerFactionBuff(event, winnerFaction);
      rewardSummary.winnerBuff = winnerResult.buff;
      rewardSummary.factionReward = winnerResult.factionReward;
    }
  }

  event.rewardsGranted = true;
  event.rewardSummary = rewardSummary;
  addEventLog(event, 'event_settled', { playerId: event.startedByPlayerId, playerName: event.startedByPlayerName }, {
    winnerFactionId: event.winnerFactionId,
    winnerFactionName: event.winnerFactionName,
    winnerFactionTag: event.winnerFactionTag,
    rewardSummary,
  });
  await event.save();
  await emitEventUpdate(event);
  return event;
}

export async function getQgEventState(req, res) {
  try {
    const player = req.player;
    const faction = await findFactionForPlayer(player);
    let event = await getActiveOrLatestEvent();
    if (event?.status === 'active') {
      event.phase = getQGEventPhase(Date.now(), event);
      await settleEventIfNeeded(event, false);
      if (event.isModified?.()) await event.save();
    }

    return res.json(buildStatePayload({ event, player, faction }));
  } catch (error) {
    console.error('[qgEvent] get state error:', error);
    return res.status(500).json({ error: 'Erro ao carregar Tomada do QG' });
  }
}

export async function startQgEvent(req, res) {
  try {
    const player = req.player;
    const playerId = getPlayerId(player);
    const faction = await findFactionForPlayer(player);

    if (!faction) return res.status(400).json({ error: 'Você precisa estar em uma facção para iniciar a Tomada do QG.' });
    if (getBarracoLevel(player) < QG_EVENT.minBarracoLevel) {
      return res.status(403).json({ error: `Barraco nível ${QG_EVENT.minBarracoLevel}+ necessário.` });
    }
    if (!canStartQGEvent(faction, playerId)) {
      return res.status(403).json({ error: 'Apenas líder, sublíder ou membro com permissão pode iniciar esse evento.' });
    }

    const active = await getActiveEventOnly();
    if (active) {
      return res.json(buildStatePayload({ event: active, player, faction }));
    }

    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + QG_EVENT.durationMs).toISOString();
    const event = await QgEvent.create({
      slug: QG_EVENT.slug,
      status: 'active',
      phase: 'preparation',
      title: QG_EVENT.title,
      startedByPlayerId: playerId,
      startedByPlayerName: player.name || 'Jogador',
      startsAt,
      endsAt,
      participants: [],
      factions: [],
      activityLog: [],
    });

    ensureParticipant(event, player, faction);
    recalculateEventFactions(event);
    addEventLog(event, 'event_started', { playerId, playerName: player.name }, {
      factionId: faction.id,
      factionName: faction.name,
      factionTag: faction.tag,
    });
    await event.save();
    await emitEventUpdate(event);

    return res.status(201).json(buildStatePayload({ event, player, faction }));
  } catch (error) {
    console.error('[qgEvent] start error:', error);
    return res.status(500).json({ error: 'Erro ao iniciar Tomada do QG' });
  }
}

export async function joinQgEvent(req, res) {
  try {
    const player = req.player;
    const faction = await findFactionForPlayer(player);
    const event = await getActiveEventOnly();

    if (!event) return res.status(404).json({ error: 'Nenhuma Tomada do QG ativa agora.' });
    if (!faction) return res.status(400).json({ error: 'Você precisa estar em uma facção para participar.' });
    if (getBarracoLevel(player) < QG_EVENT.minBarracoLevel) {
      return res.status(403).json({ error: `Barraco nível ${QG_EVENT.minBarracoLevel}+ necessário.` });
    }

    ensureParticipant(event, player, faction);
    recalculateEventFactions(event);
    event.phase = getQGEventPhase(Date.now(), event);
    await event.save();
    await emitEventUpdate(event);

    return res.json(buildStatePayload({ event, player, faction }));
  } catch (error) {
    console.error('[qgEvent] join error:', error);
    return res.status(500).json({ error: 'Erro ao entrar na Tomada do QG' });
  }
}

export async function submitQgEventAction(req, res) {
  try {
    const player = req.player;
    const faction = await findFactionForPlayer(player);
    const event = await getActiveEventOnly();
    const actionId = String(req.body?.actionId || '').trim();
    const action = QG_EVENT_ACTIONS[actionId];

    if (!event) return res.status(404).json({ error: 'Nenhuma Tomada do QG ativa agora.' });
    if (!faction) return res.status(400).json({ error: 'Você precisa estar em uma facção para participar.' });
    if (!action) return res.status(400).json({ error: 'Ação inválida.' });

    event.phase = getQGEventPhase(Date.now(), event);
    if (event.phase === 'finished') {
      const settled = await settleEventIfNeeded(event, true);
      return res.json(buildStatePayload({ event: settled, player, faction }));
    }

    if (action.finalOnly && event.phase !== 'final') {
      return res.status(400).json({ error: 'Avanço Final só libera na reta final do evento.' });
    }

    const participant = ensureParticipant(event, player, faction);
    const cooldowns = participant.cooldowns || {};
    const availableAt = new Date(cooldowns[action.id] || 0).getTime();
    if (Number.isFinite(availableAt) && availableAt > Date.now()) {
      return res.status(429).json({
        error: 'Equipe ainda se reposicionando para essa ação.',
        retryAfter: availableAt - Date.now(),
        cooldownUntil: new Date(availableAt).toISOString(),
      });
    }

    const phaseMultiplier = event.phase === 'final' ? 1.35 : event.phase === 'preparation' ? 0.85 : 1;
    const factionMember = getFactionMember(faction, getPlayerId(player));
    const roleMultiplier = factionMember?.role === 'leader' || factionMember?.role === 'subleader' ? 1.08 : 1;
    const barracoMultiplier = 1 + Math.min(0.25, (getBarracoLevel(player) - QG_EVENT.minBarracoLevel) * 0.004);
    const points = Math.max(1, Math.floor(action.points * phaseMultiplier * roleMultiplier * barracoMultiplier));
    const heat = Math.max(0, Math.floor(action.heat * phaseMultiplier));

    participant.score = Math.max(0, toNumber(participant.score, 0)) + points;
    participant.heat = Math.max(0, toNumber(participant.heat, 0)) + heat;
    participant.lastActionAt = nowIso();
    participant.actions = participant.actions || {};
    participant.actions[action.id] = Math.max(0, Math.floor(toNumber(participant.actions[action.id], 0))) + 1;
    participant.cooldowns = participant.cooldowns || {};
    participant.cooldowns[action.id] = new Date(Date.now() + action.cooldownMs).toISOString();

    addEventLog(event, 'action_scored', { playerId: getPlayerId(player), playerName: player.name }, {
      actionId: action.id,
      actionLabel: action.label,
      points,
      heat,
      factionId: faction.id,
    });

    recalculateEventFactions(event);
    await event.save();
    await emitEventUpdate(event);

    return res.json({
      ...buildStatePayload({ event, player, faction }),
      actionResult: { actionId: action.id, points, heat, cooldownUntil: participant.cooldowns[action.id] },
    });
  } catch (error) {
    console.error('[qgEvent] action error:', error);
    return res.status(500).json({ error: 'Erro ao executar ação na Tomada do QG' });
  }
}

export async function settleQgEvent(req, res) {
  try {
    const player = req.player;
    const faction = await findFactionForPlayer(player);
    const event = await getActiveOrLatestEvent();
    if (!event) return res.status(404).json({ error: 'Nenhuma Tomada do QG encontrada.' });

    const force = Boolean(req.body?.force);
    if (force && !faction) return res.status(403).json({ error: 'Apenas membros de facção podem encerrar evento.' });
    if (force && !canStartQGEvent(faction, getPlayerId(player))) {
      return res.status(403).json({ error: 'Sem permissão para encerrar manualmente.' });
    }

    const settled = await settleEventIfNeeded(event, force);
    return res.json(buildStatePayload({ event: settled, player, faction }));
  } catch (error) {
    console.error('[qgEvent] settle error:', error);
    return res.status(500).json({ error: 'Erro ao encerrar Tomada do QG' });
  }
}
