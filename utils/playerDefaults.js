import { ECONOMY } from '../config/economyConfig.js';

export const GRID_WIDTH = 120;
export const GRID_HEIGHT = 120;

export function createEmptyGangStats() {
  return {
    totalMembers: 0,
    activeMembers: 0,
    injuredMembers: 0,
    deadMembers: 0,
    trainingMembers: 0,
    marchingMembers: 0,
    totalPower: 0,
    averageLevel: 0,
  };
}

export function createEmptyGangState() {
  return {
    members: [],
    trainingSlots: [],
    stats: createEmptyGangStats(),
    statSources: [],
    statSnapshot: null,
    updatedAtIso: null,
  };
}

export function getDefaultPlayerState() {
  return {
    hp: 100,

    factionId: null,
    gangId: null,

    niveis: {
      playerLevel: 1,
      barracoLevel: 1,
      hierarchyLevel: 1,
      arsenalLevel: 1,
      giroLevel: 1,
      lavagemLevel: 1,
      luxuryLevel: 1,
      briberyLevel: 1,
    },

    balances: {
      dirtyMoney: ECONOMY.STARTER.dirtyMoney,
      cleanMoney: ECONOMY.STARTER.cleanMoney,
      corre: ECONOMY.STARTER.corre,
    },

    inventory: {
      items: [],
      gifts: [],
      rewards: [],
    },

    pageLevels: {
      barraco: 1,
      giro: 1,
      lavagem: 1,
      luxury: 1,
      arsenal: 1,
      bribery: 1,
      hierarchy: 1,
      home: 1,
      game: 1,
    },

    skills: {
      attack: 0,
      defense: 0,
      intelligence: 0,
      agility: 0,
      respect: 0,
      vigor: 0,
    },

    power: 0,
    vip: false,

    lastSkillTrainAt: 0,
    lastAttackAt: 0,
    hierarchyBadge: 'Antena',

    barracoPosition: {
      x: 0,
      y: 0,
      z: 0,
    },

    mapPosition: {
      tileX: Math.floor(GRID_WIDTH / 2),
      tileY: Math.floor(GRID_HEIGHT / 2),
      worldX: 0,
      worldY: 0,
    },

    laundryProgress: {
      activeOperations: [],
      dailyOperations: [],
    },

    punishments: {
      active: [],
      delacao: {
        active: false,
        expiresAt: null,
      },
      inventoryBlocked: false,
      dirtyMoneyBlocked: false,
      cleanMoneyBlocked: false,
      levelProgressionBlocked: false,
      inventoryBonusReductionPercent: 0,
      pvpProtectionUntil: null,
      delacaoRewardPending: false,
      delacaoRewardUnlockAt: null,
      pendingSkillBoost: 0,
      lastVehicleLost: false,
    },

    skillBoostMultiplier: 1,

    headerCustomization: {
      playerNameFont: 'oswald',
      playerNameFontSize: '1.875rem',
      playerNameColor: '#1a1205',
      customName: '',
      customAvatar: '',
    },

    ownedVehicles: [],
    purchasedAccessories: [],
    accessories: {
      vehicles: {},
      weapons: {},
    },

    convoyAccelerators: {
      twoX: 0,
    },

    barracoAccelerators: {
      seconds: 0,
    },

    barracoUpgrade: {
      active: false,
      status: 'idle',
      fromLevel: 1,
      toLevel: 1,
      cost: 0,
      durationMs: 0,
      startedAt: null,
      endsAt: null,
      completedAt: null,
      acceleratedMs: 0,
    },

    azideiaDaily: {
      date: '',
      x9Kills: 0,
      x9FactionAcceleratorsReceived: 0,
      correriaNegotiations: 0,
      correriaFactionCorreReceived: 0,
    },

    convoys: {
      ownedSkinIds: ['comboio_padrao'],
      equippedSkinId: 'comboio_padrao',
    },

    notifications: [],
    attackHistory: [],

    gang: createEmptyGangState(),

    version: 0,
    lastPassiveIncomeAt: Date.now(),
    lastSpinAt: 0,

    dailyCorre: {
      streak: 0,
      lastClaimDate: '',
      totalClaims: 0,
    },

    prisonHistory: {
      windowStart: 0,
      countInWindow: 0,
      lastPrisonAt: 0,
      cooldownUntil: 0,
    },

    spinRateLimit: {
      windowStart: 0,
      spinCount: 0,
    },

    cardCollection: {
      cards: [],
      completedSets: [],
      totalCardsCollected: 0,
      chests: {
        common: 0,
        rare: 0,
        epic: 0,
      },
    },

    // Campos de combate PvP (preenchidos no fluxo real; defaults aqui só pra forma)
    shieldExpiresAt: 0,
    shieldSource: null,
    lastAttacksAgainst: {},
    combatModifiers: {
      velocityBonus: 0,
      capacityBonus: 0,
      cooldownMultiplier: 1,
    },
  };
}