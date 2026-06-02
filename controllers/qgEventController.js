import QgEvent from '../models/QgEvent.js';
import Faction from '../models/Faction.js';
import Player from '../models/Player.js';
import { bumpVersion, generateId } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { emitToPlayer, emitToPlayers, broadcastToAll } from '../services/socketEmitter.js';
import { buildGangStatSnapshot, buildMemberStatSnapshot } from '../services/gangStatisticsService.js';
import {
  QG_EVENT,
  QG_LOCATIONS,
  QG_LOCATION_KEYS,
  QG_CT_KEYS,
  QG_MEMBER_TYPES,
  QG_MANDATE_ROLES,
  QG_MANDATE_FACTION_BUFF,
  getQgLocation,
  normalizeQGSelection,
  hasAnyQGSelection,
  getQGIndividualReward,
  getQGFactionReward,
} from '../data/qgEventCatalog.js';

const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;
const QG_STAT_SOURCE_PREFIX = 'tomada_qg_';

function nowIso() { return new Date().toISOString(); }
function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function asString(value) { return String(value || '').trim(); }
function getPlayerId(player) { return String(player?._id || ''); }
function getBarracoLevel(player) { return clamp(Math.floor(toNumber(player?.niveis?.barracoLevel, 1)), 1, 100); }
function dateMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
function formatName(playerOrMember) { return String(playerOrMember?.playerName || playerOrMember?.name || 'Jogador'); }

function nextSaoPaulo22FromNow(now = Date.now()) {
  const spLocal = new Date(now - SAO_PAULO_OFFSET_MS);
  let candidate = Date.UTC(
    spLocal.getUTCFullYear(),
    spLocal.getUTCMonth(),
    spLocal.getUTCDate(),
    QG_EVENT.startHourLocal + 3,
    QG_EVENT.startMinuteLocal,
    0,
    0,
  );

  if (candidate + QG_EVENT.maxBattleMs <= now) {
    candidate += QG_EVENT.intervalMs;
  }

  return candidate;
}

function nextStartFromLatest(latestEvent, now = Date.now()) {
  if (!latestEvent?.startsAt) return nextSaoPaulo22FromNow(now);
  let next = dateMs(latestEvent.startsAt) + QG_EVENT.intervalMs;
  while (next + QG_EVENT.maxBattleMs <= now) next += QG_EVENT.intervalMs;
  return next;
}

function buildInitialLocations() {
  return QG_LOCATIONS.map((location) => ({
    key: location.key,
    kind: location.kind,
    name: location.name,
    occupantFactionId: null,
    occupantFactionName: '',
    occupantFactionTag: '',
    occupiedSince: null,
    lastControlChangeAt: null,
    capacity: 0,
    firstOccupantPlayerId: '',
    firstOccupantPlayerName: '',
    garrison: [],
    lastCtDamageTickAt: null,
    totalDamageDealt: 0,
  }));
}

function ensureLocations(event) {
  if (!Array.isArray(event.locations)) event.locations = [];
  for (const config of QG_LOCATIONS) {
    let location = event.locations.find((item) => item.key === config.key);
    if (!location) {
      location = buildInitialLocations().find((item) => item.key === config.key);
      event.locations.push(location);
    }
    location.kind = config.kind;
    location.name = config.name;
    if (!Array.isArray(location.garrison)) location.garrison = [];
  }
  return event.locations;
}

function getLocationState(event, key) {
  ensureLocations(event);
  return event.locations.find((item) => item.key === String(key));
}

function getGarrisonCount(location) {
  return (location?.garrison || []).reduce((sum, group) => sum + Math.max(0, Math.floor(toNumber(group.activeCount ?? group.memberIds?.length, 0))), 0);
}

function getGarrisonPower(location) {
  return (location?.garrison || []).reduce((sum, group) => sum + Math.max(0, toNumber(group.power, 0)), 0);
}

function cleanGarrison(location) {
  if (!location) return;
  location.garrison = (location.garrison || []).filter((group) => Array.isArray(group.memberIds) && group.memberIds.length > 0 && toNumber(group.activeCount, 0) > 0);
}

function addEventLog(event, type, actor = {}, metadata = {}) {
  if (!Array.isArray(event.activityLog)) event.activityLog = [];
  event.activityLog.push({
    id: generateId(),
    type,
    actorPlayerId: asString(actor.playerId || actor._id),
    actorPlayerName: asString(actor.playerName || actor.name || 'Sistema') || 'Sistema',
    metadata,
    createdAt: nowIso(),
  });
  if (event.activityLog.length > 160) event.activityLog = event.activityLog.slice(-160);
}

function getFactionMember(faction, playerId) {
  return Array.isArray(faction?.members)
    ? faction.members.find((member) => String(member.playerId) === String(playerId))
    : null;
}

async function findFactionForPlayer(player) {
  const playerId = getPlayerId(player);
  const storedFactionId = asString(player?.factionId);
  const membershipFaction = playerId ? await Faction.findOne({ 'members.playerId': playerId }) : null;

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

function calculateFactionCapacity(player, faction) {
  const barracoPart = getBarracoLevel(player) * QG_EVENT.qgBaseCapacityPerBarracoLevel;
  const factionLevel = clamp(Math.floor(toNumber(faction?.level, 1)), 1, 100);
  const factionLevelBonus = factionLevel * QG_EVENT.factionLevelCapacityBonus;
  const membersBonus = Math.max(0, (faction?.members || []).length) * QG_EVENT.factionMemberCapacityBonus;
  return Math.max(100, Math.floor(barracoPart + Math.max(factionLevelBonus, membersBonus)));
}

function calculateLocationCapacity(locationKey, player, faction) {
  const base = calculateFactionCapacity(player, faction);
  const config = getQgLocation(locationKey);
  if (config?.kind === 'qg') return base;
  return Math.max(50, Math.floor(base * QG_EVENT.ctCapacityRatio));
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
      contribution: 0,
      qgCaptures: 0,
      ctCaptures: 0,
      defensesWon: 0,
      troopsSent: 0,
      troopsLost: 0,
      lastActionAt: null,
      joinedAt: nowIso(),
      reward: null,
      rewardGrantedAt: null,
    };
    event.participants.push(participant);
  }
  return participant;
}

function getFactionScore(event, faction) {
  const factionId = String(faction?.id || faction?.factionId || '');
  let score = event.factions.find((item) => String(item.factionId) === factionId);
  if (!score) {
    score = {
      factionId,
      factionName: String(faction?.name || faction?.factionName || ''),
      factionTag: String(faction?.tag || faction?.factionTag || ''),
      contribution: 0,
      qgHoldMs: 0,
      qgMaxContinuousHoldMs: 0,
      qgCaptures: 0,
      ctCaptures: 0,
      ctDamageDealt: 0,
      participants: 0,
      lastActionAt: null,
    };
    event.factions.push(score);
  }
  return score;
}

function recalculateParticipantsPerFaction(event) {
  const counts = new Map();
  for (const participant of event.participants || []) {
    const factionId = String(participant.factionId || '');
    if (!factionId) continue;
    counts.set(factionId, (counts.get(factionId) || 0) + 1);
  }
  for (const score of event.factions || []) {
    score.participants = counts.get(String(score.factionId)) || 0;
  }
  event.factions = (event.factions || []).sort((a, b) => {
    const aHold = toNumber(a.qgMaxContinuousHoldMs, 0);
    const bHold = toNumber(b.qgMaxContinuousHoldMs, 0);
    if (bHold !== aHold) return bHold - aHold;
    return toNumber(b.contribution, 0) - toNumber(a.contribution, 0);
  });
}

function finalizeQGHold(event, untilMs = Date.now()) {
  const qg = getLocationState(event, 'qg');
  if (!qg?.occupantFactionId || !qg.occupiedSince) return 0;
  const started = dateMs(qg.occupiedSince);
  const delta = Math.max(0, untilMs - started);
  if (delta <= 0) return 0;

  const score = getFactionScore(event, {
    factionId: qg.occupantFactionId,
    factionName: qg.occupantFactionName,
    factionTag: qg.occupantFactionTag,
  });
  score.qgHoldMs = Math.max(0, toNumber(score.qgHoldMs, 0)) + delta;
  score.qgMaxContinuousHoldMs = Math.max(toNumber(score.qgMaxContinuousHoldMs, 0), delta);
  score.contribution += Math.floor(delta / 1000 / 30) * 5;
  score.lastActionAt = nowIso();
  qg.occupiedSince = new Date(untilMs).toISOString();
  return delta;
}

function clearLocationControl(location) {
  if (!location) return;
  location.occupantFactionId = null;
  location.occupantFactionName = '';
  location.occupantFactionTag = '';
  location.occupiedSince = null;
  location.lastControlChangeAt = nowIso();
  location.firstOccupantPlayerId = '';
  location.firstOccupantPlayerName = '';
  location.capacity = 0;
  location.garrison = [];
}

function setLocationControl(event, location, faction, player, capacity) {
  if (location.key === 'qg' && location.occupantFactionId && String(location.occupantFactionId) !== String(faction.id)) {
    finalizeQGHold(event, Date.now());
  }

  location.occupantFactionId = String(faction.id || '');
  location.occupantFactionName = String(faction.name || '');
  location.occupantFactionTag = String(faction.tag || '');
  location.occupiedSince = nowIso();
  location.lastControlChangeAt = nowIso();
  location.firstOccupantPlayerId = getPlayerId(player);
  location.firstOccupantPlayerName = player.name || 'Jogador';
  location.capacity = Math.max(1, Math.floor(toNumber(capacity, 0)));
  if (location.kind === 'ct') location.lastCtDamageTickAt = nowIso();
}

function getCombatPower(member, statSources = []) {
  const snapshot = buildMemberStatSnapshot({ ...member, status: 'ativo' }, statSources);
  const stats = snapshot.effectiveStats || {};
  return Math.max(
    1,
    stats.rajada * 1.35 + stats.blindagem * 1.1 + stats.folego * 1.05 + stats.quebra * 1.2,
  );
}

function selectMembersForMarch(player, selection, capacity) {
  const safeSelection = normalizeQGSelection(selection);
  const active = Array.isArray(player?.gang?.members)
    ? player.gang.members.filter((member) => member?.status === 'ativo')
    : [];
  const chosen = [];
  const byType = new Map();
  for (const member of active) {
    const type = QG_MEMBER_TYPES.includes(String(member.type)) ? String(member.type) : 'capanga';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(member);
  }

  const safeCapacity = Math.max(0, Math.floor(toNumber(capacity, 0)));
  for (const type of QG_MEMBER_TYPES) {
    const pool = byType.get(type) || [];
    const wanted = Math.min(safeSelection[type], safeCapacity - chosen.length);
    for (let i = 0; i < wanted && pool[i]; i += 1) chosen.push(pool[i]);
    if (chosen.length >= safeCapacity) break;
  }
  return chosen;
}

function summarizeSelection(members = []) {
  const out = Object.fromEntries(QG_MEMBER_TYPES.map((type) => [type, 0]));
  for (const member of members) {
    const type = QG_MEMBER_TYPES.includes(String(member.type)) ? String(member.type) : 'capanga';
    out[type] += 1;
  }
  return out;
}

function markMembersForGarrison(player, memberIds, event, locationKey) {
  if (!Array.isArray(player?.gang?.members)) return;
  const ids = new Set(memberIds.map(String));
  for (const member of player.gang.members) {
    if (!ids.has(String(member.id))) continue;
    member.status = 'marchando';
    member.activeAttackId = `qg:${String(event._id)}:${locationKey}`;
    member.marchingUntil = event.endsAt;
  }
  player.markModified?.('gang');
}

async function releaseMembers(playerId, memberIds, casualtyRate = 0, options = {}) {
  const player = await Player.findById(String(playerId));
  if (!player || !Array.isArray(player?.gang?.members)) return { lost: 0, survivors: [] };
  const ids = new Set((memberIds || []).map(String));
  const survivors = [];
  let lost = 0;
  const now = Date.now();
  const injuryMs = 60 * 60 * 1000;
  const deathRate = clamp(toNumber(options.deathRate, 0.22), 0.05, 0.85);

  for (const member of player.gang.members) {
    if (!ids.has(String(member.id))) continue;
    const hit = Math.random() < casualtyRate;
    member.activeAttackId = null;
    member.marchingUntil = null;
    if (hit) {
      lost += 1;
      if (Math.random() < deathRate) {
        member.status = 'morto';
        member.injuryEndsAt = null;
      } else {
        member.status = 'ferido';
        member.injuryEndsAt = new Date(now + injuryMs).toISOString();
      }
    } else {
      member.status = 'ativo';
      member.injuryEndsAt = null;
      survivors.push(String(member.id));
    }
  }

  player.markModified?.('gang');
  bumpVersion(player);
  await player.save();
  emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });
  emitToPlayer(String(player._id), 'gangUpdate', { gang: player.gang });
  return { lost, survivors };
}

async function damageGarrison(location, count, options = {}) {
  cleanGarrison(location);
  let remaining = Math.max(0, Math.floor(toNumber(count, 0)));
  let totalLost = 0;
  const nextGroups = [];

  for (const group of location.garrison || []) {
    if (remaining <= 0) {
      nextGroups.push(group);
      continue;
    }
    const ids = Array.isArray(group.memberIds) ? group.memberIds.map(String) : [];
    const hitCount = Math.min(ids.length, remaining);
    const hitIds = ids.slice(0, hitCount);
    const keepIds = ids.slice(hitCount);
    const result = await releaseMembers(group.playerId, hitIds, 1, options);
    totalLost += result.lost;
    remaining -= hitCount;

    if (keepIds.length > 0) {
      group.memberIds = keepIds;
      group.activeCount = keepIds.length;
      group.power = Math.max(1, toNumber(group.power, 0) * (keepIds.length / Math.max(1, ids.length)));
      nextGroups.push(group);
    }
  }

  location.garrison = nextGroups;
  cleanGarrison(location);
  return totalLost;
}

async function releaseAllGarrison(location, casualtyRate, options = {}) {
  let lost = 0;
  for (const group of location.garrison || []) {
    const result = await releaseMembers(group.playerId, group.memberIds || [], casualtyRate, options);
    lost += result.lost;
  }
  location.garrison = [];
  return lost;
}

function addContribution(event, player, faction, amount, meta = {}) {
  const participant = ensureParticipant(event, player, faction);
  participant.contribution = Math.max(0, toNumber(participant.contribution, 0)) + Math.max(0, Math.floor(amount));
  participant.lastActionAt = nowIso();
  if (meta.qgCapture) participant.qgCaptures += 1;
  if (meta.ctCapture) participant.ctCaptures += 1;
  if (meta.defenseWon) participant.defensesWon += 1;
  if (meta.troopsSent) participant.troopsSent += Math.max(0, Math.floor(meta.troopsSent));
  if (meta.troopsLost) participant.troopsLost += Math.max(0, Math.floor(meta.troopsLost));

  const score = getFactionScore(event, faction);
  score.contribution += Math.max(0, Math.floor(amount));
  if (meta.qgCapture) score.qgCaptures += 1;
  if (meta.ctCapture) score.ctCaptures += 1;
  if (meta.ctDamage) score.ctDamageDealt += Math.max(0, Math.floor(meta.ctDamage));
  score.lastActionAt = nowIso();
}

async function createScheduledOrActiveEvent(startsAtMs) {
  const startsAt = new Date(startsAtMs).toISOString();
  const endsAt = new Date(startsAtMs + QG_EVENT.maxBattleMs).toISOString();
  const status = Date.now() >= startsAtMs ? 'active' : 'scheduled';
  return QgEvent.create({
    slug: QG_EVENT.slug,
    status,
    title: QG_EVENT.title,
    startsAt,
    endsAt,
    locations: buildInitialLocations(),
    participants: [],
    factions: [],
    mandate: {},
    activityLog: [{ id: generateId(), type: 'event_scheduled', actorPlayerName: 'Sistema', metadata: { startsAt, status }, createdAt: nowIso() }],
  });
}

async function openScheduledEvent(event) {
  event.status = 'active';
  event.lastTickAt = nowIso();
  ensureLocations(event);
  addEventLog(event, 'event_started', { playerName: 'Sistema' }, { startsAt: event.startsAt, endsAt: event.endsAt });
  await event.save();
  await emitQGUpdate(event);
  return event;
}

async function getLatestEvent() {
  return QgEvent.findOne({ slug: QG_EVENT.slug }).sort({ startsAt: -1 });
}

async function getActiveLikeEvent() {
  return QgEvent.findOne({ slug: QG_EVENT.slug, status: { $in: ['scheduled', 'active', 'appointment', 'mandate'] } }).sort({ startsAt: -1 });
}

async function ensureQgEventCycle() {
  let event = await getActiveLikeEvent();
  const now = Date.now();

  if (!event) {
    const latest = await getLatestEvent();
    event = await createScheduledOrActiveEvent(nextStartFromLatest(latest, now));
  }

  if (event.status === 'scheduled' && now >= dateMs(event.startsAt)) {
    event = await openScheduledEvent(event);
  }

  if (event.status === 'active') {
    await reconcileActiveQGEvent(event);
    if (Date.now() >= dateMs(event.endsAt)) {
      event = await settleQGEventToAppointment(event);
    }
  }

  if (event.status === 'appointment' && event.appointmentEndsAt && now >= dateMs(event.appointmentEndsAt)) {
    event = await finalizeQGMandate(event);
  }

  if (event.status === 'mandate' && event.mandateEndsAt && now >= dateMs(event.mandateEndsAt)) {
    event.status = 'closed';
    event.closedAt = nowIso();
    addEventLog(event, 'mandate_closed', { playerName: 'Sistema' }, { mandateEndsAt: event.mandateEndsAt });
    await event.save();
    await emitQGUpdate(event);
    event = await createScheduledOrActiveEvent(nextStartFromLatest(event, Date.now()));
  }

  return event;
}

async function reconcileActiveQGEvent(event) {
  if (!event || event.status !== 'active') return event;
  ensureLocations(event);
  const now = Date.now();
  const qg = getLocationState(event, 'qg');
  cleanGarrison(qg);

  if (qg.occupantFactionId && getGarrisonCount(qg) <= 0) {
    finalizeQGHold(event, now);
    clearLocationControl(qg);
    addEventLog(event, 'qg_emptied', { playerName: 'Sistema' }, {});
  }

  const qgFactionId = String(qg?.occupantFactionId || '');
  if (qgFactionId) {
    for (const ctKey of QG_CT_KEYS) {
      const ct = getLocationState(event, ctKey);
      if (!ct?.occupantFactionId || String(ct.occupantFactionId) === qgFactionId) continue;
      const lastTick = dateMs(ct.lastCtDamageTickAt || event.lastTickAt || event.startsAt);
      const ticks = Math.floor((now - lastTick) / QG_EVENT.tickMs);
      if (ticks <= 0) continue;

      let totalDamage = 0;
      for (let i = 0; i < ticks; i += 1) {
        const qgCount = getGarrisonCount(qg);
        if (qgCount <= 0) break;
        const damage = clamp(Math.round(qgCount * QG_EVENT.ctDamagePercentPerTick), QG_EVENT.ctDamageMinPerTick, QG_EVENT.ctDamageMaxPerTick);
        const lost = await damageGarrison(qg, damage, { deathRate: 0.18 });
        totalDamage += lost;
      }

      ct.lastCtDamageTickAt = new Date(lastTick + ticks * QG_EVENT.tickMs).toISOString();
      ct.totalDamageDealt = Math.max(0, toNumber(ct.totalDamageDealt, 0)) + totalDamage;
      if (totalDamage > 0) {
        const score = getFactionScore(event, { factionId: ct.occupantFactionId, factionName: ct.occupantFactionName, factionTag: ct.occupantFactionTag });
        score.ctDamageDealt += totalDamage;
        score.contribution += totalDamage * 4;
        score.lastActionAt = nowIso();
        addEventLog(event, 'ct_damage_tick', { playerName: ct.occupantFactionTag || ct.occupantFactionName || 'CT' }, { ctKey, qgFactionId, damage: totalDamage });
      }

      cleanGarrison(qg);
      if (getGarrisonCount(qg) <= 0) {
        finalizeQGHold(event, now);
        clearLocationControl(qg);
        addEventLog(event, 'qg_fell_by_ct_damage', { playerName: ct.occupantFactionTag || ct.occupantFactionName || 'CT' }, { ctKey });
        break;
      }
    }
  }

  event.lastTickAt = nowIso();
  recalculateParticipantsPerFaction(event);
  await event.save();
  return event;
}

function buildDefaultMandateRoles(event, faction) {
  const winnerId = String(faction?.id || event.winnerFactionId || '');
  const members = Array.isArray(faction?.members) ? faction.members : [];
  const participants = [...(event.participants || [])]
    .filter((p) => String(p.factionId) === winnerId)
    .sort((a, b) => toNumber(b.contribution, 0) - toNumber(a.contribution, 0));

  const used = new Set();
  const pick = (preferredId = '') => {
    if (preferredId && !used.has(String(preferredId))) {
      const member = members.find((m) => String(m.playerId) === String(preferredId));
      if (member) { used.add(String(member.playerId)); return member; }
    }
    for (const participant of participants) {
      if (used.has(String(participant.playerId))) continue;
      const member = members.find((m) => String(m.playerId) === String(participant.playerId)) || participant;
      used.add(String(member.playerId || participant.playerId));
      return member;
    }
    for (const member of members) {
      if (used.has(String(member.playerId))) continue;
      used.add(String(member.playerId));
      return member;
    }
    return null;
  };

  const leader = pick(faction?.leaderId);
  const sub = pick(members.find((m) => m.role === 'subleader')?.playerId);
  const seguranca = pick(participants.sort((a, b) => (toNumber(b.defensesWon, 0) + toNumber(b.troopsLost, 0)) - (toNumber(a.defensesWon, 0) + toNumber(a.troopsLost, 0)))[0]?.playerId);
  const tesoureiro = pick(members.find((m) => m.role === 'treasurer')?.playerId);
  const choices = { lider_complexo: leader, sub_lider: sub, seguranca, tesoureiro };

  return QG_MANDATE_ROLES.map((role) => {
    const member = choices[role.id];
    return {
      roleId: role.id,
      title: role.title,
      playerId: String(member?.playerId || member?._id || ''),
      playerName: String(member?.playerName || member?.name || 'A definir'),
      assignedByPlayerId: 'system',
      assignedAt: nowIso(),
    };
  });
}

async function settleQGEventToAppointment(event) {
  if (!event || event.status !== 'active') return event;
  await reconcileActiveQGEvent(event);
  finalizeQGHold(event, dateMs(event.endsAt) || Date.now());
  recalculateParticipantsPerFaction(event);

  const ranked = [...(event.factions || [])].sort((a, b) => {
    const aQualified = toNumber(a.qgMaxContinuousHoldMs, 0) >= QG_EVENT.requiredHoldMs ? 1 : 0;
    const bQualified = toNumber(b.qgMaxContinuousHoldMs, 0) >= QG_EVENT.requiredHoldMs ? 1 : 0;
    if (bQualified !== aQualified) return bQualified - aQualified;
    const holdDiff = toNumber(b.qgMaxContinuousHoldMs, 0) - toNumber(a.qgMaxContinuousHoldMs, 0);
    if (holdDiff !== 0) return holdDiff;
    return toNumber(b.contribution, 0) - toNumber(a.contribution, 0);
  });
  const winner = ranked[0] || null;

  event.status = winner ? 'appointment' : 'closed';
  event.settledAt = nowIso();
  event.winnerFactionId = winner?.factionId || null;
  event.winnerFactionName = winner?.factionName || '';
  event.winnerFactionTag = winner?.factionTag || '';
  event.winnerReason = winner && toNumber(winner.qgMaxContinuousHoldMs, 0) >= QG_EVENT.requiredHoldMs
    ? '8h de ocupação contínua do QG'
    : winner ? 'maior ocupação contínua do QG na janela de guerra' : 'sem ocupação válida';

  if (winner) {
    const appointmentEndsAt = new Date(Date.now() + QG_EVENT.appointmentMs).toISOString();
    const mandateEndsAt = new Date(dateMs(event.startsAt) + QG_EVENT.intervalMs).toISOString();
    const winnerFaction = await Faction.findOne({ id: String(winner.factionId) });
    event.appointmentEndsAt = appointmentEndsAt;
    event.mandateEndsAt = mandateEndsAt;
    event.mandate = {
      factionId: winner.factionId,
      factionName: winner.factionName,
      factionTag: winner.factionTag,
      startsAt: null,
      endsAt: mandateEndsAt,
      appointmentEndsAt,
      roles: winnerFaction ? buildDefaultMandateRoles(event, winnerFaction) : [],
      rewardsGranted: false,
      statSourcesAppliedAt: null,
    };
    addEventLog(event, 'appointment_opened', { playerName: 'Sistema' }, { winnerFactionId: winner.factionId, appointmentEndsAt, mandateEndsAt, reason: event.winnerReason });
    await grantEventRewards(event, winnerFaction);
  } else {
    event.closedAt = nowIso();
  }

  await releaseAllLocations(event);
  await event.save();
  await emitQGUpdate(event);
  return event;
}

async function releaseAllLocations(event) {
  ensureLocations(event);
  for (const location of event.locations) {
    for (const group of location.garrison || []) {
      await releaseMembers(group.playerId, group.memberIds || [], 0);
    }
    location.garrison = [];
  }
}

async function grantEventRewards(event, winnerFaction = null) {
  if (event.rewardSummary?.participantRewardsGranted) return event.rewardSummary;
  const winnerId = String(event.winnerFactionId || '');
  const sorted = [...(event.participants || [])].sort((a, b) => toNumber(b.contribution, 0) - toNumber(a.contribution, 0));
  let granted = 0;

  for (let index = 0; index < sorted.length; index += 1) {
    const participant = sorted[index];
    if (participant.rewardGrantedAt) continue;
    const player = await Player.findById(String(participant.playerId));
    if (!player) continue;
    const reward = getQGIndividualReward({ contribution: participant.contribution, rank: index + 1, winner: String(participant.factionId) === winnerId });
    applyRewardToPlayer(player, reward, event);
    participant.reward = reward;
    participant.rewardGrantedAt = nowIso();
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });
    granted += 1;
  }

  let factionReward = null;
  if (winnerFaction) {
    const winnerScore = (event.factions || []).find((item) => String(item.factionId) === String(winnerFaction.id));
    factionReward = getQGFactionReward({ contribution: winnerScore?.contribution || 0, memberCount: winnerFaction.members?.length || 1 });
    if (!winnerFaction.treasury) winnerFaction.treasury = { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
    winnerFaction.treasury.cleanMoney = Math.max(0, toNumber(winnerFaction.treasury.cleanMoney, 0)) + factionReward.cityTreasury.cleanMoney;
    winnerFaction.treasury.dirtyMoney = Math.max(0, toNumber(winnerFaction.treasury.dirtyMoney, 0)) + factionReward.cityTreasury.dirtyMoney;
    winnerFaction.treasury.corre = Math.max(0, toNumber(winnerFaction.treasury.corre, 0)) + factionReward.cityTreasury.corre;
    winnerFaction.exp = Math.max(0, toNumber(winnerFaction.exp, 0)) + factionReward.factionExp;
    winnerFaction.activityLog = Array.isArray(winnerFaction.activityLog) ? winnerFaction.activityLog : [];
    winnerFaction.activityLog.push({ id: generateId(), type: 'qg_event_won', actorPlayerName: 'Sistema', metadata: { eventId: String(event._id), factionReward }, createdAt: nowIso() });
    winnerFaction.markModified?.('treasury');
    winnerFaction.markModified?.('activityLog');
    await winnerFaction.save();
  }

  event.rewardSummary = { participantRewardsGranted: granted, factionReward };
  return event.rewardSummary;
}

function applyRewardToPlayer(player, reward, event) {
  if (!player.balances) player.balances = { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
  if (!player.inventory) player.inventory = { items: [], gifts: [], rewards: [] };
  if (!Array.isArray(player.inventory.rewards)) player.inventory.rewards = [];
  if (!player.convoyAccelerators) player.convoyAccelerators = { twoX: 0 };
  if (!player.barracoAccelerators) player.barracoAccelerators = { seconds: 0 };

  player.balances.cleanMoney += Math.max(0, Math.floor(toNumber(reward.cleanMoney, 0)));
  player.balances.dirtyMoney += Math.max(0, Math.floor(toNumber(reward.dirtyMoney, 0)));
  player.balances.corre += Math.max(0, Math.floor(toNumber(reward.corre, 0)));
  player.battlePrestige = Math.max(0, Math.floor(toNumber(player.battlePrestige, 0))) + Math.max(0, Math.floor(toNumber(reward.battlePrestige, 0)));
  player.barracoAccelerators.seconds += Math.max(0, Math.floor(toNumber(reward.barracoAcceleratorSeconds, 0)));
  player.convoyAccelerators.twoX += Math.max(0, Math.floor(toNumber(reward.convoyAcceleratorTwoX, 0)));
  player.inventory.rewards.push({ id: `tomada_qg_reward_${String(event._id)}_${Date.now()}`, type: 'event_reward', source: 'tomada_qg', name: 'Recompensa da Tomada do QG', reward, createdAt: nowIso() });
  player.markModified?.('balances');
  player.markModified?.('inventory');
  player.markModified?.('barracoAccelerators');
  player.markModified?.('convoyAccelerators');
  bumpVersion(player);
}

function roleConfig(roleId) {
  return QG_MANDATE_ROLES.find((role) => role.id === String(roleId)) || null;
}

async function finalizeQGMandate(event) {
  if (!event || event.status !== 'appointment') return event;
  const winnerFaction = event.winnerFactionId ? await Faction.findOne({ id: String(event.winnerFactionId) }) : null;
  if (!winnerFaction) {
    event.status = 'closed';
    event.closedAt = nowIso();
    await event.save();
    return event;
  }

  event.status = 'mandate';
  event.mandate.startsAt = nowIso();
  event.mandate.endsAt = event.mandateEndsAt;
  event.mandate.statSourcesAppliedAt = nowIso();
  await applyMandateStatSources(event, winnerFaction);
  addEventLog(event, 'mandate_started', { playerName: 'Sistema' }, { winnerFactionId: winnerFaction.id, roles: event.mandate.roles });
  await event.save();
  await emitQGUpdate(event);
  return event;
}

async function applyMandateStatSources(event, faction) {
  const expiresAt = event.mandateEndsAt || new Date(Date.now() + QG_EVENT.mandateMs).toISOString();
  const memberIds = [...new Set((faction.members || []).map((member) => String(member.playerId)).filter(Boolean))];
  const players = await Player.find({ _id: { $in: memberIds } });
  const roleByPlayer = new Map((event.mandate?.roles || []).filter((role) => role.playerId).map((role) => [String(role.playerId), role]));
  const factionSource = {
    id: `${QG_MANDATE_FACTION_BUFF.idPrefix}_${String(event._id)}`,
    source: QG_MANDATE_FACTION_BUFF.source,
    label: `${QG_MANDATE_FACTION_BUFF.label} - ${faction.tag || faction.name}`,
    targetScope: QG_MANDATE_FACTION_BUFF.targetScope,
    targetType: null,
    targetMemberId: null,
    percent: QG_MANDATE_FACTION_BUFF.percent,
    flat: QG_MANDATE_FACTION_BUFF.flat,
    enabled: true,
    expiresAt,
    updatedAtIso: nowIso(),
  };

  for (const player of players) {
    if (!player.gang) player.gang = { members: [], trainingSlots: [], stats: {}, statSources: [] };
    if (!Array.isArray(player.gang.statSources)) player.gang.statSources = [];
    player.gang.statSources = player.gang.statSources.filter((source) => !String(source?.id || '').startsWith(QG_STAT_SOURCE_PREFIX));
    player.gang.statSources.push(factionSource);

    const role = roleByPlayer.get(String(player._id));
    const cfg = roleConfig(role?.roleId);
    if (cfg) {
      player.gang.statSources.push({
        id: `${QG_STAT_SOURCE_PREFIX}${cfg.id}_${String(event._id)}`,
        source: 'evento',
        label: `${cfg.title} do QG`,
        targetScope: 'global',
        targetType: null,
        targetMemberId: null,
        percent: cfg.percent,
        flat: { rajada: 0, blindagem: 0, folego: 0, quebra: 0 },
        enabled: true,
        expiresAt,
        updatedAtIso: nowIso(),
      });
    }

    player.gang.statSnapshot = buildGangStatSnapshot(player.gang.members || [], player.gang.statSources);
    player.gang.updatedAtIso = nowIso();
    player.markModified?.('gang');
    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });
    emitToPlayer(String(player._id), 'gangUpdate', { gang: player.gang });
  }

  if (!Array.isArray(faction.activeBuffs)) faction.activeBuffs = [];
  faction.activeBuffs = faction.activeBuffs.filter((buff) => String(buff.type) !== 'tomada_qg_mandato');
  faction.activeBuffs.push({ id: factionSource.id, name: 'Mandato do QG', type: 'tomada_qg_mandato', value: 1, startedAt: nowIso(), endsAt: expiresAt });
  faction.markModified?.('activeBuffs');
  await faction.save();

  emitToPlayers(memberIds, 'qg:mandateStarted', () => ({ eventId: String(event._id), factionId: faction.id, roles: event.mandate.roles, buff: factionSource, expiresAt }));
}

async function emitQGUpdate(event) {
  recalculateParticipantsPerFaction(event);
  broadcastToAll('qg:eventUpdated', { event: normalizeEvent(event), config: publicConfig() });
}

function publicConfig() {
  return {
    ...QG_EVENT,
    locations: QG_LOCATIONS,
    mandateRoles: QG_MANDATE_ROLES,
    factionBuff: QG_MANDATE_FACTION_BUFF.percent,
  };
}

function normalizeLocation(location, event) {
  const config = getQgLocation(location.key) || {};
  const qg = getLocationState(event, 'qg');
  const occupantFactionId = String(location.occupantFactionId || '');
  const currentHoldMs = location.key === 'qg' && occupantFactionId && location.occupiedSince
    ? Math.max(0, Date.now() - dateMs(location.occupiedSince))
    : 0;
  return {
    key: location.key,
    kind: location.kind,
    name: location.name || config.name,
    shortName: config.shortName || location.name,
    description: config.description || '',
    accent: config.accent || '#ffffff',
    occupantFactionId: location.occupantFactionId || null,
    occupantFactionName: location.occupantFactionName || '',
    occupantFactionTag: location.occupantFactionTag || '',
    occupiedSince: location.occupiedSince || null,
    currentHoldMs,
    capacity: Math.max(0, Math.floor(toNumber(location.capacity, 0))),
    garrisonCount: getGarrisonCount(location),
    garrisonPower: Math.round(getGarrisonPower(location)),
    firstOccupantPlayerId: location.firstOccupantPlayerId || '',
    firstOccupantPlayerName: location.firstOccupantPlayerName || '',
    totalDamageDealt: Math.max(0, Math.floor(toNumber(location.totalDamageDealt, 0))),
    hostileToQG: location.kind === 'ct' && Boolean(qg?.occupantFactionId && occupantFactionId && occupantFactionId !== String(qg.occupantFactionId)),
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
    contribution: Math.floor(toNumber(participant.contribution, 0)),
    qgCaptures: Math.floor(toNumber(participant.qgCaptures, 0)),
    ctCaptures: Math.floor(toNumber(participant.ctCaptures, 0)),
    defensesWon: Math.floor(toNumber(participant.defensesWon, 0)),
    troopsSent: Math.floor(toNumber(participant.troopsSent, 0)),
    troopsLost: Math.floor(toNumber(participant.troopsLost, 0)),
    lastActionAt: participant.lastActionAt || null,
    reward: participant.reward || null,
    rewardGrantedAt: participant.rewardGrantedAt || null,
    rank,
  };
}

function normalizeEvent(event, currentPlayerId = null) {
  if (!event) return null;
  ensureLocations(event);
  const sortedParticipants = [...(event.participants || [])].sort((a, b) => toNumber(b.contribution, 0) - toNumber(a.contribution, 0));
  const currentIndex = currentPlayerId
    ? sortedParticipants.findIndex((item) => String(item.playerId) === String(currentPlayerId))
    : -1;
  const rankedFactions = [...(event.factions || [])].sort((a, b) => {
    const holdDiff = toNumber(b.qgMaxContinuousHoldMs, 0) - toNumber(a.qgMaxContinuousHoldMs, 0);
    if (holdDiff !== 0) return holdDiff;
    return toNumber(b.contribution, 0) - toNumber(a.contribution, 0);
  });

  return {
    id: String(event._id),
    slug: event.slug,
    status: event.status,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    appointmentEndsAt: event.appointmentEndsAt || event.mandate?.appointmentEndsAt || null,
    mandateEndsAt: event.mandateEndsAt || event.mandate?.endsAt || null,
    settledAt: event.settledAt || null,
    winnerFactionId: event.winnerFactionId || null,
    winnerFactionName: event.winnerFactionName || '',
    winnerFactionTag: event.winnerFactionTag || '',
    winnerReason: event.winnerReason || '',
    locations: event.locations.map((location) => normalizeLocation(location, event)),
    qg: normalizeLocation(getLocationState(event, 'qg'), event),
    leaderboard: rankedFactions.map((item, index) => ({
      rank: index + 1,
      factionId: String(item.factionId || ''),
      factionName: String(item.factionName || ''),
      factionTag: String(item.factionTag || ''),
      contribution: Math.floor(toNumber(item.contribution, 0)),
      qgHoldMs: Math.floor(toNumber(item.qgHoldMs, 0)),
      qgMaxContinuousHoldMs: Math.max(
        Math.floor(toNumber(item.qgMaxContinuousHoldMs, 0)),
        String(item.factionId) === String(getLocationState(event, 'qg')?.occupantFactionId || '')
          ? Math.floor(Date.now() - dateMs(getLocationState(event, 'qg')?.occupiedSince))
          : 0,
      ),
      qgCaptures: Math.floor(toNumber(item.qgCaptures, 0)),
      ctCaptures: Math.floor(toNumber(item.ctCaptures, 0)),
      ctDamageDealt: Math.floor(toNumber(item.ctDamageDealt, 0)),
      participants: Math.floor(toNumber(item.participants, 0)),
      lastActionAt: item.lastActionAt || null,
    })),
    topParticipants: sortedParticipants.slice(0, 15).map((participant, index) => normalizeParticipant(participant, index + 1)),
    myParticipant: currentIndex >= 0 ? normalizeParticipant(sortedParticipants[currentIndex], currentIndex + 1) : null,
    mandate: event.mandate || null,
    rewardSummary: event.rewardSummary || {},
    activityLog: Array.isArray(event.activityLog) ? event.activityLog.slice(-35).reverse() : [],
  };
}

function buildEligibility({ player, faction, event }) {
  const barracoLevel = getBarracoLevel(player);
  const member = faction ? getFactionMember(faction, getPlayerId(player)) : null;
  return {
    hasFaction: Boolean(faction),
    factionId: faction?.id || null,
    factionName: faction?.name || null,
    factionTag: faction?.tag || null,
    role: member?.role || null,
    canMarch: Boolean(event?.status === 'active' && faction && barracoLevel >= QG_EVENT.minBarracoLevel),
    canAppoint: Boolean(event?.status === 'appointment' && faction && String(event.winnerFactionId || '') === String(faction.id || '') && String(faction.leaderId || '') === getPlayerId(player)),
    barracoLevel,
    minBarracoLevel: QG_EVENT.minBarracoLevel,
    marchCapacity: faction ? calculateFactionCapacity(player, faction) : getBarracoLevel(player) * QG_EVENT.qgBaseCapacityPerBarracoLevel,
    reason: !faction
      ? 'Você precisa estar em uma facção para disputar o QG.'
      : barracoLevel < QG_EVENT.minBarracoLevel
        ? `Barraco nível ${QG_EVENT.minBarracoLevel}+ necessário.`
        : null,
  };
}

function buildStatePayload({ event, player, faction }) {
  return {
    ok: true,
    config: publicConfig(),
    eligibility: buildEligibility({ player, faction, event }),
    event: normalizeEvent(event, getPlayerId(player)),
    serverTime: nowIso(),
  };
}

export async function getQgEventState(req, res) {
  try {
    const event = await ensureQgEventCycle();
    const faction = await findFactionForPlayer(req.player);
    return res.json(buildStatePayload({ event, player: req.player, faction }));
  } catch (error) {
    console.error('[qgEvent] state error:', error);
    return res.status(500).json({ error: 'Erro ao carregar Tomada do QG' });
  }
}

export async function sendQgMarch(req, res) {
  try {
    let event = await ensureQgEventCycle();
    if (!event || event.status !== 'active') return res.status(400).json({ error: 'A Tomada do QG não está em guerra agora.' });

    const player = req.player;
    const faction = await findFactionForPlayer(player);
    if (!faction) return res.status(400).json({ error: 'Você precisa estar em uma facção para disputar o QG.' });
    if (getBarracoLevel(player) < QG_EVENT.minBarracoLevel) return res.status(403).json({ error: `Barraco nível ${QG_EVENT.minBarracoLevel}+ necessário.` });

    const locationKey = String(req.body?.locationKey || '').trim();
    const locationConfig = getQgLocation(locationKey);
    if (!locationConfig || !QG_LOCATION_KEYS.includes(locationKey)) return res.status(400).json({ error: 'Ponto inválido. Use QG ou um dos CTs do mapa.' });

    const selection = normalizeQGSelection(req.body?.selection || {});
    if (!hasAnyQGSelection(selection)) return res.status(400).json({ error: 'Selecione membros da gangue para enviar.' });

    const location = getLocationState(event, locationKey);
    cleanGarrison(location);
    const baseCapacity = calculateLocationCapacity(locationKey, player, faction);
    const remainingForFriendly = location.occupantFactionId === String(faction.id)
      ? Math.max(0, toNumber(location.capacity, baseCapacity) - getGarrisonCount(location))
      : baseCapacity;
    const selectedMembers = selectMembersForMarch(player, selection, remainingForFriendly);
    if (!selectedMembers.length) return res.status(400).json({ error: 'Não há membros ativos suficientes para essa marcha ou a capacidade está cheia.' });

    const selectedIds = selectedMembers.map((member) => String(member.id));
    const statSources = Array.isArray(player?.gang?.statSources) ? player.gang.statSources : [];
    const power = Math.round(selectedMembers.reduce((sum, member) => sum + getCombatPower(member, statSources), 0));
    const group = {
      id: generateId(),
      playerId: getPlayerId(player),
      playerName: player.name || 'Jogador',
      factionId: String(faction.id),
      factionName: faction.name || '',
      factionTag: faction.tag || '',
      memberIds: selectedIds,
      selection: summarizeSelection(selectedMembers),
      power,
      originalCount: selectedIds.length,
      activeCount: selectedIds.length,
      joinedAt: nowIso(),
    };

    const previousOwner = String(location.occupantFactionId || '');
    const isEmpty = !previousOwner || getGarrisonCount(location) <= 0;
    const isFriendly = previousOwner && previousOwner === String(faction.id);
    let outcome = 'reinforced';
    let attackerLost = 0;
    let defenderLost = 0;

    if (isEmpty) {
      setLocationControl(event, location, faction, player, baseCapacity);
      location.garrison = [group];
      outcome = locationKey === 'qg' ? 'qg_occupied' : 'ct_occupied';
      addContribution(event, player, faction, locationKey === 'qg' ? 650 : 280, { troopsSent: selectedIds.length, qgCapture: locationKey === 'qg', ctCapture: locationKey !== 'qg' });
      markMembersForGarrison(player, selectedIds, event, locationKey);
    } else if (isFriendly) {
      location.garrison.push(group);
      outcome = locationKey === 'qg' ? 'qg_reinforced' : 'ct_reinforced';
      addContribution(event, player, faction, Math.max(60, selectedIds.length * 2), { troopsSent: selectedIds.length });
      markMembersForGarrison(player, selectedIds, event, locationKey);
    } else {
      const defenderPower = Math.max(1, getGarrisonPower(location));
      const attackerScore = power * (0.92 + Math.random() * 0.18);
      const defenderScore = defenderPower * (0.92 + Math.random() * 0.18);
      const attackerWon = attackerScore >= defenderScore;

      if (attackerWon) {
        const defenderLossRate = clamp(0.55 + (power / Math.max(1, defenderPower)) * 0.08, 0.55, 0.90);
        const attackerLossRate = clamp((defenderPower / Math.max(1, power)) * 0.22, 0.08, 0.38);
        defenderLost = await releaseAllGarrison(location, defenderLossRate, { deathRate: 0.26 });
        const casualty = await releaseMembers(getPlayerId(player), selectedIds, attackerLossRate, { deathRate: 0.18 });
        attackerLost = casualty.lost;
        const survivorIds = casualty.survivors;

        if (survivorIds.length > 0) {
          const survivorGroup = { ...group, memberIds: survivorIds, activeCount: survivorIds.length, power: Math.max(1, Math.round(power * (survivorIds.length / Math.max(1, selectedIds.length)))) };
          setLocationControl(event, location, faction, player, baseCapacity);
          location.garrison = [survivorGroup];
          markMembersForGarrison(player, survivorIds, event, locationKey);
        } else {
          clearLocationControl(location);
        }

        outcome = locationKey === 'qg' ? 'qg_captured' : 'ct_captured';
        addContribution(event, player, faction, (locationKey === 'qg' ? 1200 : 520) + defenderLost * 4, { troopsSent: selectedIds.length, troopsLost: attackerLost, qgCapture: locationKey === 'qg', ctCapture: locationKey !== 'qg' });
      } else {
        const attackerLossRate = clamp(0.45 + (defenderPower / Math.max(1, power)) * 0.10, 0.45, 0.88);
        const defenderLossRate = clamp((power / Math.max(1, defenderPower)) * 0.10, 0.03, 0.18);
        const casualty = await releaseMembers(getPlayerId(player), selectedIds, attackerLossRate, { deathRate: 0.25 });
        attackerLost = casualty.lost;
        defenderLost = await damageGarrison(location, Math.max(1, Math.floor(getGarrisonCount(location) * defenderLossRate)), { deathRate: 0.12 });
        outcome = 'attack_repelled';
        addContribution(event, player, faction, Math.max(50, Math.floor(power / 40)), { troopsSent: selectedIds.length, troopsLost: attackerLost });
        const defenderFactionScore = getFactionScore(event, { factionId: location.occupantFactionId, factionName: location.occupantFactionName, factionTag: location.occupantFactionTag });
        defenderFactionScore.contribution += Math.max(75, attackerLost * 3);
        defenderFactionScore.lastActionAt = nowIso();
      }
    }

    cleanGarrison(location);
    if (location.occupantFactionId && getGarrisonCount(location) <= 0) clearLocationControl(location);
    recalculateParticipantsPerFaction(event);
    addEventLog(event, outcome, { playerId: getPlayerId(player), playerName: player.name }, { locationKey, factionId: faction.id, membersSent: selectedIds.length, power, attackerLost, defenderLost });

    player.markModified?.('gang');
    bumpVersion(player);
    await player.save();
    await event.save();
    emitToPlayer(getPlayerId(player), 'playerUpdate', { player: mergePlayerState(player.toObject()) });
    await emitQGUpdate(event);

    return res.json({
      ...buildStatePayload({ event, player, faction }),
      marchResult: { locationKey, outcome, membersSent: selectedIds.length, power, attackerLost, defenderLost },
    });
  } catch (error) {
    console.error('[qgEvent] march error:', error);
    return res.status(500).json({ error: 'Erro ao enviar gangue para a Tomada do QG' });
  }
}

export async function appointQgRole(req, res) {
  try {
    const event = await ensureQgEventCycle();
    const player = req.player;
    const faction = await findFactionForPlayer(player);
    if (!event || event.status !== 'appointment') return res.status(400).json({ error: 'Não há janela de nomeação aberta.' });
    if (!faction || String(faction.id) !== String(event.winnerFactionId)) return res.status(403).json({ error: 'Apenas a facção vencedora pode nomear cargos.' });
    if (String(faction.leaderId || '') !== getPlayerId(player)) return res.status(403).json({ error: 'Apenas o líder da facção vencedora pode nomear cargos.' });

    const roleId = String(req.body?.roleId || '').trim();
    const targetPlayerId = String(req.body?.playerId || '').trim();
    const role = roleConfig(roleId);
    const member = (faction.members || []).find((item) => String(item.playerId) === targetPlayerId);
    if (!role) return res.status(400).json({ error: 'Cargo inválido.' });
    if (!member) return res.status(400).json({ error: 'Jogador não pertence à facção vencedora.' });

    if (!event.mandate) event.mandate = {};
    if (!Array.isArray(event.mandate.roles)) event.mandate.roles = [];
    const index = event.mandate.roles.findIndex((item) => item.roleId === roleId);
    const nextRole = { roleId, title: role.title, playerId: targetPlayerId, playerName: member.playerName || 'Jogador', assignedByPlayerId: getPlayerId(player), assignedAt: nowIso() };
    if (index >= 0) event.mandate.roles[index] = nextRole;
    else event.mandate.roles.push(nextRole);

    addEventLog(event, 'role_appointed', { playerId: getPlayerId(player), playerName: player.name }, { roleId, targetPlayerId, targetPlayerName: member.playerName });
    await event.save();
    await emitQGUpdate(event);
    return res.json(buildStatePayload({ event, player, faction }));
  } catch (error) {
    console.error('[qgEvent] appoint role error:', error);
    return res.status(500).json({ error: 'Erro ao nomear cargo do QG' });
  }
}

export async function forceReconcileQgEvent(req, res) {
  try {
    const event = await ensureQgEventCycle();
    const faction = await findFactionForPlayer(req.player);
    return res.json(buildStatePayload({ event, player: req.player, faction }));
  } catch (error) {
    console.error('[qgEvent] reconcile error:', error);
    return res.status(500).json({ error: 'Erro ao reconciliar Tomada do QG' });
  }
}

// Compatibilidade com botões antigos: o evento agora é automático, sem start manual e sem ações fake.
export async function startQgEvent(req, res) { return getQgEventState(req, res); }
export async function joinQgEvent(req, res) { return getQgEventState(req, res); }
export async function submitQgEventAction(req, res) {
  return res.status(410).json({ error: 'Ações de pontuação foram removidas. Use ocupação real do QG e dos CTs.' });
}
export async function settleQgEvent(req, res) { return forceReconcileQgEvent(req, res); }

export async function runQgEventSchedulerTick() {
  try {
    await ensureQgEventCycle();
  } catch (error) {
    console.error('[qgEvent] scheduler tick error:', error?.message || error);
  }
}
