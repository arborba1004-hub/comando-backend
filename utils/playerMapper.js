import { getDefaultPlayerState } from './playerDefaults.js';

function ensureObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
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
      items: Array.isArray(incoming.inventory?.items) ? incoming.inventory.items : defaults.inventory.items,
      gifts: Array.isArray(incoming.inventory?.gifts) ? incoming.inventory.gifts : defaults.inventory.gifts,
      rewards: Array.isArray(incoming.inventory?.rewards) ? incoming.inventory.rewards : defaults.inventory.rewards,
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

    notifications: Array.isArray(incoming.notifications) ? incoming.notifications : defaults.notifications,
    attackHistory: Array.isArray(incoming.attackHistory) ? incoming.attackHistory : defaults.attackHistory,
    ownedVehicles: Array.isArray(incoming.ownedVehicles) ? incoming.ownedVehicles : defaults.ownedVehicles,
    purchasedAccessories: Array.isArray(incoming.purchasedAccessories)
      ? incoming.purchasedAccessories
      : defaults.purchasedAccessories,
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

  merged.mapPosition.tileX = Number(merged.mapPosition.tileX || 0);
  merged.mapPosition.tileY = Number(merged.mapPosition.tileY || 0);
  merged.mapPosition.worldX = Number(merged.mapPosition.worldX || 0);
  merged.mapPosition.worldY = Number(merged.mapPosition.worldY || 0);

  merged.barracoPosition.x = Number(merged.barracoPosition.x || 0);
  merged.barracoPosition.y = Number(merged.barracoPosition.y || 0);
  merged.barracoPosition.z = Number(merged.barracoPosition.z || 0);

  return merged;
}