// services/gangStatisticsService.js
// Sistema autoritativo de estatísticas da gangue.
//
// Regra central:
// - Atributos base vêm APENAS do tipo + nível do membro.
// - Estatísticas são fontes de bônus salvas em player.gang.statSources.
// - A batalha e a UI devem consumir effectiveStats, sem sobrescrever atributos base.

import { randomUUID } from 'crypto';

export const MEMBER_TYPES = [
  'capanga', 'frente', 'executor', 'assassino',
  'muralha', 'certeiro', 'motorista', 'nitro',
];

// ─── ATRIBUTOS (rajada=ATQ, blindagem=DEF, folego=HP, quebra=DANO) ──────────
export const ATRIBUTOS_GANG = {
  capanga:  {
    1:  { rajada: 9,  blindagem: 13, folego: 12, quebra: 8  },
    2:  { rajada: 10, blindagem: 15, folego: 14, quebra: 9  },
    3:  { rajada: 11, blindagem: 17, folego: 16, quebra: 10 },
    4:  { rajada: 13, blindagem: 19, folego: 18, quebra: 11 },
    5:  { rajada: 15, blindagem: 21, folego: 20, quebra: 12 },
    6:  { rajada: 17, blindagem: 23, folego: 22, quebra: 13 },
    7:  { rajada: 19, blindagem: 25, folego: 24, quebra: 14 },
    8:  { rajada: 21, blindagem: 27, folego: 26, quebra: 15 },
    9:  { rajada: 23, blindagem: 29, folego: 28, quebra: 16 },
    10: { rajada: 25, blindagem: 31, folego: 30, quebra: 17 },
  },
  frente: {
    1:  { rajada: 12, blindagem: 9,  folego: 10, quebra: 12 },
    2:  { rajada: 14, blindagem: 10, folego: 11, quebra: 14 },
    3:  { rajada: 16, blindagem: 11, folego: 12, quebra: 16 },
    4:  { rajada: 18, blindagem: 12, folego: 13, quebra: 18 },
    5:  { rajada: 20, blindagem: 14, folego: 15, quebra: 21 },
    6:  { rajada: 22, blindagem: 15, folego: 16, quebra: 23 },
    7:  { rajada: 25, blindagem: 17, folego: 18, quebra: 26 },
    8:  { rajada: 27, blindagem: 18, folego: 19, quebra: 28 },
    9:  { rajada: 30, blindagem: 20, folego: 21, quebra: 31 },
    10: { rajada: 32, blindagem: 22, folego: 23, quebra: 34 },
  },
  executor: {
    1:  { rajada: 11, blindagem: 7,  folego: 9,  quebra: 12 },
    2:  { rajada: 13, blindagem: 8,  folego: 10, quebra: 14 },
    3:  { rajada: 15, blindagem: 9,  folego: 11, quebra: 16 },
    4:  { rajada: 17, blindagem: 10, folego: 12, quebra: 18 },
    5:  { rajada: 19, blindagem: 11, folego: 13, quebra: 21 },
    6:  { rajada: 21, blindagem: 12, folego: 14, quebra: 23 },
    7:  { rajada: 24, blindagem: 13, folego: 15, quebra: 26 },
    8:  { rajada: 26, blindagem: 14, folego: 16, quebra: 29 },
    9:  { rajada: 29, blindagem: 15, folego: 17, quebra: 32 },
    10: { rajada: 31, blindagem: 16, folego: 18, quebra: 35 },
  },
  assassino: {
    1:  { rajada: 12, blindagem: 7,  folego: 8,  quebra: 13 },
    2:  { rajada: 14, blindagem: 8,  folego: 9,  quebra: 15 },
    3:  { rajada: 16, blindagem: 9,  folego: 10, quebra: 17 },
    4:  { rajada: 18, blindagem: 10, folego: 11, quebra: 20 },
    5:  { rajada: 20, blindagem: 11, folego: 12, quebra: 23 },
    6:  { rajada: 22, blindagem: 12, folego: 13, quebra: 26 },
    7:  { rajada: 25, blindagem: 13, folego: 14, quebra: 29 },
    8:  { rajada: 27, blindagem: 14, folego: 15, quebra: 32 },
    9:  { rajada: 30, blindagem: 15, folego: 16, quebra: 35 },
    10: { rajada: 33, blindagem: 16, folego: 17, quebra: 38 },
  },
  muralha: {
    1:  { rajada: 6,  blindagem: 15, folego: 16, quebra: 5  },
    2:  { rajada: 7,  blindagem: 17, folego: 18, quebra: 6  },
    3:  { rajada: 8,  blindagem: 19, folego: 20, quebra: 7  },
    4:  { rajada: 9,  blindagem: 21, folego: 22, quebra: 8  },
    5:  { rajada: 10, blindagem: 24, folego: 25, quebra: 9  },
    6:  { rajada: 11, blindagem: 26, folego: 27, quebra: 10 },
    7:  { rajada: 12, blindagem: 29, folego: 30, quebra: 11 },
    8:  { rajada: 13, blindagem: 31, folego: 32, quebra: 12 },
    9:  { rajada: 14, blindagem: 34, folego: 35, quebra: 13 },
    10: { rajada: 15, blindagem: 37, folego: 38, quebra: 14 },
  },
  certeiro: {
    1:  { rajada: 9,  blindagem: 10, folego: 10, quebra: 8  },
    2:  { rajada: 10, blindagem: 11, folego: 11, quebra: 9  },
    3:  { rajada: 11, blindagem: 12, folego: 12, quebra: 10 },
    4:  { rajada: 12, blindagem: 13, folego: 13, quebra: 11 },
    5:  { rajada: 13, blindagem: 15, folego: 14, quebra: 12 },
    6:  { rajada: 14, blindagem: 16, folego: 15, quebra: 13 },
    7:  { rajada: 16, blindagem: 18, folego: 17, quebra: 15 },
    8:  { rajada: 17, blindagem: 19, folego: 18, quebra: 16 },
    9:  { rajada: 19, blindagem: 21, folego: 20, quebra: 18 },
    10: { rajada: 21, blindagem: 23, folego: 22, quebra: 20 },
  },
  motorista: {
    1:  { rajada: 7,  blindagem: 14, folego: 14, quebra: 7  },
    2:  { rajada: 8,  blindagem: 16, folego: 16, quebra: 8  },
    3:  { rajada: 9,  blindagem: 18, folego: 18, quebra: 9  },
    4:  { rajada: 10, blindagem: 20, folego: 20, quebra: 10 },
    5:  { rajada: 11, blindagem: 23, folego: 23, quebra: 11 },
    6:  { rajada: 12, blindagem: 25, folego: 25, quebra: 12 },
    7:  { rajada: 13, blindagem: 28, folego: 28, quebra: 13 },
    8:  { rajada: 14, blindagem: 30, folego: 30, quebra: 14 },
    9:  { rajada: 15, blindagem: 33, folego: 33, quebra: 15 },
    10: { rajada: 17, blindagem: 36, folego: 36, quebra: 17 },
  },
  nitro: {
    1:  { rajada: 8,  blindagem: 13, folego: 15, quebra: 8  },
    2:  { rajada: 9,  blindagem: 15, folego: 17, quebra: 9  },
    3:  { rajada: 10, blindagem: 17, folego: 19, quebra: 10 },
    4:  { rajada: 11, blindagem: 19, folego: 21, quebra: 11 },
    5:  { rajada: 12, blindagem: 21, folego: 24, quebra: 12 },
    6:  { rajada: 13, blindagem: 23, folego: 26, quebra: 13 },
    7:  { rajada: 15, blindagem: 26, folego: 29, quebra: 15 },
    8:  { rajada: 17, blindagem: 28, folego: 32, quebra: 17 },
    9:  { rajada: 19, blindagem: 31, folego: 35, quebra: 19 },
    10: { rajada: 21, blindagem: 34, folego: 38, quebra: 21 },
  },
};

const STAT_KEYS = ['rajada', 'blindagem', 'folego', 'quebra'];

export const BARRACO_GANG_STAT_SOURCE_ID = 'barraco_level_bonus';
export const BARRACO_GANG_STAT_SOURCE_LABEL = 'Bônus do Barraco';
export const BARRACO_GANG_STAT_BONUS_PER_LEVEL = 1;

function getBarracoLevelFromPlayer(player = {}) {
  return clamp(toPositiveInt(player?.niveis?.barracoLevel, 1), 1, 100);
}

export function getBarracoGangStatBonusPercent(level = 1) {
  const safeLevel = clamp(toPositiveInt(level, 1), 1, 100);
  return Math.max(0, (safeLevel - 1) * BARRACO_GANG_STAT_BONUS_PER_LEVEL);
}

export function buildBarracoGangStatSource(level = 1) {
  const safeLevel = clamp(toPositiveInt(level, 1), 1, 100);
  const bonusPercent = getBarracoGangStatBonusPercent(safeLevel);

  return sanitizeGangStatSource({
    id: BARRACO_GANG_STAT_SOURCE_ID,
    source: 'barraco',
    label: `${BARRACO_GANG_STAT_SOURCE_LABEL} Nv. ${safeLevel}`,
    targetScope: 'global',
    percent: {
      rajada: bonusPercent,
      blindagem: bonusPercent,
      folego: bonusPercent,
      quebra: bonusPercent,
    },
    flat: { rajada: 0, blindagem: 0, folego: 0, quebra: 0 },
    enabled: true,
    expiresAt: null,
  });
}

function barracoSourceSignature(source = {}) {
  return JSON.stringify({
    id: String(source?.id || ''),
    source: String(source?.source || ''),
    label: String(source?.label || ''),
    targetScope: String(source?.targetScope || ''),
    targetType: source?.targetType ?? null,
    targetMemberId: source?.targetMemberId ?? null,
    percent: cloneStats(source?.percent),
    flat: cloneStats(source?.flat),
    enabled: source?.enabled !== false,
    expiresAt: source?.expiresAt ? String(source.expiresAt) : null,
  });
}

export function applyBarracoGangStatSourceToList(statSources = [], barracoLevel = 1) {
  const safeSources = sanitizeGangStatSources(statSources);
  const barracoSource = buildBarracoGangStatSource(barracoLevel);
  const index = safeSources.findIndex((source) => source.id === BARRACO_GANG_STAT_SOURCE_ID);

  if (index >= 0) {
    const current = safeSources[index];
    const isSame = barracoSourceSignature(current) === barracoSourceSignature(barracoSource);
    safeSources[index] = isSame ? current : barracoSource;
  } else {
    safeSources.push(barracoSource);
  }

  return safeSources;
}

export function syncBarracoGangStatBonus(player) {
  if (!player) {
    return { changed: false, source: null, statSnapshot: null };
  }

  if (!player.gang) player.gang = { members: [], trainingSlots: [], stats: {}, statSources: [] };

  const barracoLevel = getBarracoLevelFromPlayer(player);
  const before = Array.isArray(player?.gang?.statSources) ? player.gang.statSources : [];
  const next = applyBarracoGangStatSourceToList(before, barracoLevel);
  const source = next.find((item) => item.id === BARRACO_GANG_STAT_SOURCE_ID) || null;

  const beforeBarraco = sanitizeGangStatSources(before).find((item) => item.id === BARRACO_GANG_STAT_SOURCE_ID);
  const changed = barracoSourceSignature(beforeBarraco || {}) !== barracoSourceSignature(source || {});

  player.gang.statSources = next;
  player.gang.statSnapshot = buildGangStatSnapshot(player.gang.members || [], next);
  player.gang.updatedAtIso = new Date().toISOString();

  if (changed && typeof player.markModified === 'function') player.markModified('gang');

  return { changed, source, statSnapshot: player.gang.statSnapshot };
}

const VALID_SOURCES = [
  'formacao',
  'ct',
  'arsenal',
  'suborno',
  'investimento',
  'faccao',
  'evento',
  'manual',
  'barraco',
  'loja',
  'item',
];

const VALID_TARGET_SCOPES = ['global', 'type', 'member'];

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInt(value, fallback = 1) {
  const numeric = Math.floor(toNumber(value, fallback));
  return numeric > 0 ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round2(value) {
  return Math.round(toNumber(value, 0) * 100) / 100;
}

function emptyStats() {
  return { rajada: 0, blindagem: 0, folego: 0, quebra: 0 };
}

function cloneStats(input = {}) {
  const out = emptyStats();
  for (const key of STAT_KEYS) {
    out[key] = round2(input?.[key] ?? 0);
  }
  return out;
}

function normalizeMemberType(type) {
  return MEMBER_TYPES.includes(String(type)) ? String(type) : 'capanga';
}

function normalizeMemberLevel(level) {
  return clamp(toPositiveInt(level, 1), 1, 10);
}

export function getBaseAttributes(member = {}) {
  const type = normalizeMemberType(member?.type);
  const level = normalizeMemberLevel(member?.level);
  return { ...ATRIBUTOS_GANG[type][level] };
}

export function sanitizeGangStatSource(input = {}) {
  const source = VALID_SOURCES.includes(String(input?.source))
    ? String(input.source)
    : 'manual';

  const targetScope = VALID_TARGET_SCOPES.includes(String(input?.targetScope))
    ? String(input.targetScope)
    : 'global';

  const targetType = targetScope === 'type' && MEMBER_TYPES.includes(String(input?.targetType))
    ? String(input.targetType)
    : null;

  const targetMemberId = targetScope === 'member' && input?.targetMemberId
    ? String(input.targetMemberId)
    : null;

  return {
    id: String(input?.id || `${source}_${targetScope}_${randomUUID()}`),
    source,
    label: String(input?.label || source),
    targetScope,
    targetType,
    targetMemberId,
    percent: cloneStats(input?.percent),
    flat: cloneStats(input?.flat),
    enabled: input?.enabled !== false,
    expiresAt: input?.expiresAt ? String(input.expiresAt) : null,
    updatedAtIso: new Date().toISOString(),
  };
}

export function sanitizeGangStatSources(input = []) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];

  for (const item of input) {
    const safe = sanitizeGangStatSource(item);
    if (seen.has(safe.id)) continue;
    seen.add(safe.id);
    out.push(safe);
  }

  return out;
}

function isSourceExpired(source) {
  if (!source?.expiresAt) return false;
  const time = new Date(source.expiresAt).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

function sourceAppliesToMember(source, member) {
  if (!source?.enabled || isSourceExpired(source)) return false;

  const scope = String(source.targetScope || 'global');
  if (scope === 'global') return true;

  if (scope === 'type') {
    return String(source.targetType || '') === String(member?.type || '');
  }

  if (scope === 'member') {
    return String(source.targetMemberId || '') === String(member?.id || '');
  }

  return false;
}

export function resolveStatSourcesForMember(member, statSources = []) {
  const safeSources = sanitizeGangStatSources(statSources);
  return safeSources.filter((source) => sourceAppliesToMember(source, member));
}

export function buildMemberStatSnapshot(member = {}, statSources = []) {
  const safeType = normalizeMemberType(member?.type);
  const safeLevel = normalizeMemberLevel(member?.level);
  const baseAttributes = getBaseAttributes({ type: safeType, level: safeLevel });
  const activeSources = resolveStatSourcesForMember(
    { ...member, type: safeType, level: safeLevel },
    statSources
  );

  const bonusPercent = emptyStats();
  const bonusFlat = emptyStats();

  for (const source of activeSources) {
    for (const key of STAT_KEYS) {
      bonusPercent[key] += toNumber(source?.percent?.[key], 0);
      bonusFlat[key] += toNumber(source?.flat?.[key], 0);
    }
  }

  const effectiveStats = emptyStats();
  for (const key of STAT_KEYS) {
    const min = key === 'rajada' || key === 'folego' ? 1 : 0;
    effectiveStats[key] = round2(Math.max(min, baseAttributes[key] * (1 + bonusPercent[key] / 100) + bonusFlat[key]));
    bonusPercent[key] = round2(bonusPercent[key]);
    bonusFlat[key] = round2(bonusFlat[key]);
  }

  return {
    id: String(member?.id || ''),
    type: safeType,
    level: safeLevel,
    status: String(member?.status || 'ativo'),
    baseAttributes,
    bonusPercent,
    bonusFlat,
    effectiveStats,
    activeStatSources: activeSources.map((source) => source.id),
  };
}

export function buildGangStatSnapshot(members = [], statSources = []) {
  const safeMembers = Array.isArray(members) ? members : [];
  const safeSources = sanitizeGangStatSources(statSources);
  const memberSnapshots = safeMembers.map((member) => buildMemberStatSnapshot(member, safeSources));
  const activeMembers = memberSnapshots.filter((member) => member.status === 'ativo');

  const baseTotals = emptyStats();
  const bonusFlatTotals = emptyStats();
  const effectiveTotals = emptyStats();

  for (const member of activeMembers) {
    for (const key of STAT_KEYS) {
      baseTotals[key] += toNumber(member.baseAttributes[key], 0);
      bonusFlatTotals[key] += toNumber(member.bonusFlat[key], 0);
      effectiveTotals[key] += toNumber(member.effectiveStats[key], 0);
    }
  }

  for (const key of STAT_KEYS) {
    baseTotals[key] = round2(baseTotals[key]);
    bonusFlatTotals[key] = round2(bonusFlatTotals[key]);
    effectiveTotals[key] = round2(effectiveTotals[key]);
  }

  const bonusPercentAverage = emptyStats();
  for (const key of STAT_KEYS) {
    const totalPercent = activeMembers.reduce((sum, member) => sum + toNumber(member.bonusPercent[key], 0), 0);
    bonusPercentAverage[key] = activeMembers.length ? round2(totalPercent / activeMembers.length) : 0;
  }

  const totalPower = Math.round(
    effectiveTotals.rajada * 1.35 +
    effectiveTotals.blindagem * 1.10 +
    effectiveTotals.folego * 1.05 +
    effectiveTotals.quebra * 1.20
  );

  return {
    members: memberSnapshots,
    statSources: safeSources,
    totals: {
      baseAttributes: baseTotals,
      bonusPercentAverage,
      bonusFlat: bonusFlatTotals,
      effectiveStats: effectiveTotals,
    },
    summary: {
      totalMembers: safeMembers.length,
      ativos: activeMembers.length,
      feridos: memberSnapshots.filter((member) => member.status === 'ferido').length,
      mortos: memberSnapshots.filter((member) => member.status === 'morto').length,
      rajada: Math.round(effectiveTotals.rajada),
      blindagem: Math.round(effectiveTotals.blindagem),
      folego: Math.round(effectiveTotals.folego),
      quebra: Math.round(effectiveTotals.quebra),
      medicalPower: 0,
      lootPower: 0,
      mobilityPower: Math.round(
        activeMembers
          .filter((member) => member.type === 'motorista' || member.type === 'nitro')
          .reduce((sum, member) => sum + member.effectiveStats.folego * 0.25, 0)
      ),
      totalPower,
    },
    updatedAtIso: new Date().toISOString(),
  };
}

export function upsertGangStatSource(player, payload = {}) {
  if (!player.gang) player.gang = { members: [], trainingSlots: [], stats: {}, statSources: [] };
  const current = sanitizeGangStatSources(player.gang.statSources);
  const nextSource = sanitizeGangStatSource(payload);
  const index = current.findIndex((source) => source.id === nextSource.id);

  if (index >= 0) current[index] = { ...current[index], ...nextSource, updatedAtIso: new Date().toISOString() };
  else current.push(nextSource);

  player.gang.statSources = current;
  player.gang.statSnapshot = buildGangStatSnapshot(player.gang.members || [], current);
  player.gang.updatedAtIso = new Date().toISOString();

  if (typeof player.markModified === 'function') player.markModified('gang');
  return { source: nextSource, statSnapshot: player.gang.statSnapshot };
}

export function removeGangStatSource(player, sourceId) {
  if (!player.gang) player.gang = { members: [], trainingSlots: [], stats: {}, statSources: [] };
  const safeId = String(sourceId || '');
  const current = sanitizeGangStatSources(player.gang.statSources);
  const next = current.filter((source) => source.id !== safeId);

  player.gang.statSources = next;
  player.gang.statSnapshot = buildGangStatSnapshot(player.gang.members || [], next);
  player.gang.updatedAtIso = new Date().toISOString();

  if (typeof player.markModified === 'function') player.markModified('gang');
  return { removed: current.length !== next.length, statSnapshot: player.gang.statSnapshot };
}
