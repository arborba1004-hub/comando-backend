export const GRID_WIDTH = 40;
export const GRID_HEIGHT = 20;

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
      dirtyMoney: 1000,
      cleanMoney: 0,
      corre: 1000,
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
    },

    ownedVehicles: [],
    purchasedAccessories: [],
    accessories: {
      vehicles: {},
      weapons: {},
    },

    notifications: [],
    attackHistory: [],

    version: 0,
    lastPassiveIncomeAt: Date.now(),
    lastSpinAt: 0,
  };
}