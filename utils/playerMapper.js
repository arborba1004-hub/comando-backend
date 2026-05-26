import {
  getDefaultPlayerState,
  GRID_WIDTH,
  GRID_HEIGHT,
  createEmptyGangState,
  createEmptyGangStats,
} from './playerDefaults.js';

const LOT_SIZE = 6;
const GANG_MEMBER_TYPES = [
  'capanga',
  'frente',
  'executor',
  'assassino',
  'muralha',
  'certeiro',
  'motorista',
  'nitro',
];

const TRAINING_CT_KEYS = ['ct_nw', 'ct_ne', 'ct_sw', 'ct_se'];
const GANG_STAT_SOURCES = [
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
const GANG_STAT_TARGET_SCOPES = ['global', 'type', 'member'];
const GANG_STAT_KEYS = ['rajada', 'blindagem', 'folego', 'quebra'];

function ensureObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function snapTileToLotOrigin(tile, maxTiles) {
  const numericTile = Number.isFinite(Number(tile)) ? Math.floor(Number(tile)) : 0;
  const snapped = Math.floor(numericTile / LOT_SIZE) * LOT_SIZE;
  return Math.max(0, Math.min(maxTiles - LOT_SIZE, snapped));
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInt(value, fallback = 1) {
  const numeric = Math.floor(toNumber(value, fallback));
  return numeric > 0 ? numeric : fallback;
}

export function recalculateGangStats(gangMembers = []) {
  const totalMembers = gangMembers.length;
  const activeMembers = gangMembers.filter((item) => item.status === 'ativo').length;
  const injuredMembers = gangMembers.filter((item) => item.status === 'ferido').length;
  const deadMembers = gangMembers.filter((item) => item.status === 'morto').length;
  const trainingMembers = gangMembers.filter((item) => item.status === 'treinando').length;
  const marchingMembers = gangMembers.filter((item) => item.status === 'marchando').length;

  const totalLevels = gangMembers.reduce(
    (sum, item) => sum + toPositiveInt(item.level, 1),
    0
  );

  const totalPower = gangMembers.reduce((sum, item) => {
    return sum + toPositiveInt(item.level, 1) * 10;
  }, 0);

  return {
    totalMembers,
    activeMembers,
    injuredMembers,
    deadMembers,
    trainingMembers,
    marchingMembers,
    totalPower,
    averageLevel: totalMembers > 0 ? Number((totalLevels / totalMembers).toFixed(2)) : 0,
  };
}


function sanitizeTrainingSlot(slot, index = 0) {
  const safeCtKey = TRAINING_CT_KEYS.includes(String(slot?.ctKey))
    ? String(slot.ctKey)
    : 'ct_nw';

  const safeTroopType = GANG_MEMBER_TYPES.includes(String(slot?.troopType))
    ? String(slot.troopType)
    : 'capanga';

  const startedAt = toNumber(slot?.startedAt, Date.now());
  const endsAt = toNumber(slot?.endsAt, startedAt);
  const safeStatus = ['training', 'completed'].includes(String(slot?.status))
    ? String(slot.status)
    : Date.now() >= endsAt
      ? 'completed'
      : 'training';

  return {
    id: String(slot?.id || `training_slot_${index}_${Date.now()}`),
    ctKey: safeCtKey,
    troopType: safeTroopType,
    quantity: Math.max(1, toPositiveInt(slot?.quantity, 1)),
    startedAt,
    endsAt,
    status: safeStatus,
    cost: Math.max(0, toNumber(slot?.cost, 0)),
  };
}

function sanitizeGangMember(member, index = 0) {
  const safeType = GANG_MEMBER_TYPES.includes(String(member?.type))
    ? String(member.type)
    : 'capanga';

  const safeStatus = ['ativo', 'ferido', 'morto', 'treinando', 'marchando'].includes(String(member?.status))
    ? String(member.status)
    : 'ativo';

  return {
    id: String(member?.id || `gang_member_${index}_${Date.now()}`),
    type: safeType,
    level: Math.max(1, Math.min(10, toPositiveInt(member?.level, 1))),
    status: safeStatus,
    recruitedAt: String(member?.recruitedAt || new Date().toISOString()),
    trainingEndsAt: member?.trainingEndsAt ? String(member.trainingEndsAt) : null,
    injuryEndsAt: member?.injuryEndsAt ? String(member.injuryEndsAt) : null,
    activeAttackId: member?.activeAttackId ? String(member.activeAttackId) : null,
    marchingUntil: member?.marchingUntil ? String(member.marchingUntil) : null,
  };
}


function sanitizeStatNumbers(input) {
  const raw = ensureObject(input);
  return GANG_STAT_KEYS.reduce((acc, key) => {
    acc[key] = toNumber(raw[key], 0);
    return acc;
  }, {});
}

function sanitizeGangStatSource(source, index = 0) {
  const raw = ensureObject(source);
  const safeSource = GANG_STAT_SOURCES.includes(String(raw.source))
    ? String(raw.source)
    : 'manual';
  const safeTargetScope = GANG_STAT_TARGET_SCOPES.includes(String(raw.targetScope))
    ? String(raw.targetScope)
    : 'global';

  return {
    id: String(raw.id || `${safeSource}_${safeTargetScope}_${index}`),
    source: safeSource,
    label: String(raw.label || safeSource),
    targetScope: safeTargetScope,
    targetType:
      safeTargetScope === 'type' && GANG_MEMBER_TYPES.includes(String(raw.targetType))
        ? String(raw.targetType)
        : null,
    targetMemberId:
      safeTargetScope === 'member' && raw.targetMemberId
        ? String(raw.targetMemberId)
        : null,
    percent: sanitizeStatNumbers(raw.percent),
    flat: sanitizeStatNumbers(raw.flat),
    enabled: raw.enabled !== false,
    expiresAt: raw.expiresAt ? String(raw.expiresAt) : null,
    updatedAtIso: raw.updatedAtIso ? String(raw.updatedAtIso) : new Date().toISOString(),
  };
}

function sanitizeGangStatSources(input) {
  return Array.isArray(input)
    ? input.map((item, index) => sanitizeGangStatSource(item, index))
    : [];
}

function sanitizeGangState(input) {
  const defaults = createEmptyGangState();
  const raw = ensureObject(input);
  const members = Array.isArray(raw.members)
    ? raw.members.map((item, index) => sanitizeGangMember(item, index))
    : defaults.members;

  const trainingSlots = Array.isArray(raw.trainingSlots)
    ? raw.trainingSlots.map((item, index) => sanitizeTrainingSlot(item, index))
    : defaults.trainingSlots;

  return {
    members,
    trainingSlots,
    stats: recalculateGangStats(members),
    statSources: sanitizeGangStatSources(raw.statSources),
    statSnapshot: raw.statSnapshot && typeof raw.statSnapshot === 'object' ? raw.statSnapshot : null,
    updatedAtIso: raw.updatedAtIso ? String(raw.updatedAtIso) : null,
  };
}

export function mergePlayerState(incoming = {}) {
  const defaults = getDefaultPlayerState();

  return {
    ...defaults,
    ...incoming,

    niveis: {
      ...defaults.niveis,
      ...ensureObject(incoming.niveis),
    },

    balances: {
      ...defaults.balances,
      ...ensureObject(incoming.balances),
    },

    inventory: {
      ...defaults.inventory,
      ...ensureObject(incoming.inventory),
      items: Array.isArray(incoming.inventory?.items)
        ? incoming.inventory.items
        : defaults.inventory.items,
      gifts: Array.isArray(incoming.inventory?.gifts)
        ? incoming.inventory.gifts
        : defaults.inventory.gifts,
      rewards: Array.isArray(incoming.inventory?.rewards)
        ? incoming.inventory.rewards
        : defaults.inventory.rewards,
    },

    pageLevels: {
      ...defaults.pageLevels,
      ...ensureObject(incoming.pageLevels),
    },

    skills: {
      ...defaults.skills,
      ...ensureObject(incoming.skills),
    },

    barracoPosition: {
      ...defaults.barracoPosition,
      ...ensureObject(incoming.barracoPosition),
    },

    mapPosition: {
      ...defaults.mapPosition,
      ...ensureObject(incoming.mapPosition),
    },

    laundryProgress: {
      ...defaults.laundryProgress,
      ...ensureObject(incoming.laundryProgress),
      activeOperations: Array.isArray(incoming.laundryProgress?.activeOperations)
        ? incoming.laundryProgress.activeOperations
        : defaults.laundryProgress.activeOperations,
      dailyOperations: Array.isArray(incoming.laundryProgress?.dailyOperations)
        ? incoming.laundryProgress.dailyOperations
        : defaults.laundryProgress.dailyOperations,
    },

    punishments: {
      ...defaults.punishments,
      ...ensureObject(incoming.punishments),
      active: Array.isArray(incoming.punishments?.active)
        ? incoming.punishments.active
        : defaults.punishments.active,
      delacao: {
        ...defaults.punishments.delacao,
        ...ensureObject(incoming.punishments?.delacao),
      },
    },

    headerCustomization: {
      ...defaults.headerCustomization,
      ...ensureObject(incoming.headerCustomization),
    },

    accessories: {
      ...defaults.accessories,
      ...ensureObject(incoming.accessories),
    },

    convoyAccelerators: {
      twoX: Math.max(0, Math.floor(toNumber(incoming.convoyAccelerators?.twoX, defaults.convoyAccelerators?.twoX ?? 0))),
    },

    barracoAccelerators: {
      seconds: Math.max(0, Math.floor(toNumber(incoming.barracoAccelerators?.seconds, defaults.barracoAccelerators?.seconds ?? 0))),
    },

    barracoUpgrade: {
      active: incoming.barracoUpgrade?.active === true,
      status: ['idle', 'building', 'ready', 'completed'].includes(String(incoming.barracoUpgrade?.status))
        ? String(incoming.barracoUpgrade.status)
        : 'idle',
      fromLevel: Math.max(1, Math.floor(toNumber(incoming.barracoUpgrade?.fromLevel, defaults.barracoUpgrade?.fromLevel ?? 1))),
      toLevel: Math.max(1, Math.floor(toNumber(incoming.barracoUpgrade?.toLevel, defaults.barracoUpgrade?.toLevel ?? 1))),
      cost: Math.max(0, Math.floor(toNumber(incoming.barracoUpgrade?.cost, defaults.barracoUpgrade?.cost ?? 0))),
      durationMs: Math.max(0, Math.floor(toNumber(incoming.barracoUpgrade?.durationMs, defaults.barracoUpgrade?.durationMs ?? 0))),
      startedAt: incoming.barracoUpgrade?.startedAt ? String(incoming.barracoUpgrade.startedAt) : null,
      endsAt: incoming.barracoUpgrade?.endsAt ? String(incoming.barracoUpgrade.endsAt) : null,
      completedAt: incoming.barracoUpgrade?.completedAt ? String(incoming.barracoUpgrade.completedAt) : null,
      acceleratedMs: Math.max(0, Math.floor(toNumber(incoming.barracoUpgrade?.acceleratedMs, defaults.barracoUpgrade?.acceleratedMs ?? 0))),
    },

    azideiaDaily: {
      date: incoming.azideiaDaily?.date ? String(incoming.azideiaDaily.date) : defaults.azideiaDaily?.date ?? '',
      x9Kills: Math.max(0, Math.floor(toNumber(incoming.azideiaDaily?.x9Kills, defaults.azideiaDaily?.x9Kills ?? 0))),
      x9FactionAcceleratorsReceived: Math.max(0, Math.floor(toNumber(incoming.azideiaDaily?.x9FactionAcceleratorsReceived, defaults.azideiaDaily?.x9FactionAcceleratorsReceived ?? 0))),
      correriaNegotiations: Math.max(0, Math.floor(toNumber(incoming.azideiaDaily?.correriaNegotiations, defaults.azideiaDaily?.correriaNegotiations ?? 0))),
      correriaFactionCorreReceived: Math.max(0, Math.floor(toNumber(incoming.azideiaDaily?.correriaFactionCorreReceived, defaults.azideiaDaily?.correriaFactionCorreReceived ?? 0))),
    },

    convoys: {
      ownedSkinIds: Array.isArray(incoming.convoys?.ownedSkinIds)
        ? Array.from(new Set(['comboio_padrao', ...incoming.convoys.ownedSkinIds.map(String)]))
        : defaults.convoys.ownedSkinIds,
      equippedSkinId: incoming.convoys?.equippedSkinId
        ? String(incoming.convoys.equippedSkinId)
        : defaults.convoys.equippedSkinId,
    },

    notifications: Array.isArray(incoming.notifications)
      ? incoming.notifications
      : defaults.notifications,

    attackHistory: Array.isArray(incoming.attackHistory)
      ? incoming.attackHistory
      : defaults.attackHistory,

    ownedVehicles: Array.isArray(incoming.ownedVehicles)
      ? incoming.ownedVehicles
      : defaults.ownedVehicles,

    purchasedAccessories: Array.isArray(incoming.purchasedAccessories)
      ? incoming.purchasedAccessories
      : defaults.purchasedAccessories,

    gang: sanitizeGangState(incoming.gang),
  };
}

export function sanitizePlayerState(incoming = {}) {
  const merged = mergePlayerState(incoming);

  merged.hp = Math.max(0, Number(merged.hp || 0));
  merged.power = Math.max(0, Number(merged.power || 0));
  merged.skillBoostMultiplier = Math.max(0, Number(merged.skillBoostMultiplier || 1));
  merged.version = Math.max(0, Number(merged.version || 0));
  merged.lastSkillTrainAt = Math.max(0, Number(merged.lastSkillTrainAt || 0));
  merged.lastAttackAt = Math.max(0, Number(merged.lastAttackAt || 0));
  merged.lastPassiveIncomeAt = Math.max(0, Number(merged.lastPassiveIncomeAt || Date.now()));
  merged.lastSpinAt = Math.max(0, Number(merged.lastSpinAt || 0));

  merged.balances.dirtyMoney = Math.max(0, Number(merged.balances.dirtyMoney || 0));
  merged.balances.cleanMoney = Math.max(0, Number(merged.balances.cleanMoney || 0));
  merged.balances.corre = Math.max(0, Number(merged.balances.corre || 0));

  for (const key of Object.keys(merged.niveis)) {
    merged.niveis[key] = Math.max(1, Number(merged.niveis[key] || 1));
  }

  for (const key of Object.keys(merged.pageLevels)) {
    merged.pageLevels[key] = Math.max(1, Number(merged.pageLevels[key] || 1));
  }

  for (const key of Object.keys(merged.skills)) {
    merged.skills[key] = Math.max(0, Number(merged.skills[key] || 0));
  }

  merged.mapPosition.tileX = snapTileToLotOrigin(merged.mapPosition.tileX, GRID_WIDTH);
  merged.mapPosition.tileY = snapTileToLotOrigin(merged.mapPosition.tileY, GRID_HEIGHT);
  merged.mapPosition.worldX =
    merged.mapPosition.tileX - Math.floor(GRID_WIDTH / 2) + LOT_SIZE / 2;
  merged.mapPosition.worldY =
    merged.mapPosition.tileY - Math.floor(GRID_HEIGHT / 2) + LOT_SIZE / 2;

  merged.barracoPosition.x = Number(merged.barracoPosition.x || 0);
  merged.barracoPosition.y = Number(merged.barracoPosition.y || 0);
  merged.barracoPosition.z = Number(merged.barracoPosition.z || 0);

  merged.gang = sanitizeGangState(merged.gang);
  merged.gang.updatedAtIso = new Date().toISOString();

  return merged;
}