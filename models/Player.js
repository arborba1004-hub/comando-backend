import mongoose from 'mongoose';
import {
  getDefaultPlayerState,
  createEmptyGangState,
  createEmptyGangStats,
} from '../utils/playerDefaults.js';
import { ECONOMY } from '../config/economyConfig.js';

const activeOperationSchema = new mongoose.Schema(
  {
    id: { type: String, default: '' },
    operationId: { type: String, default: '' },
    businessId: { type: Number, required: true },
    businessName: { type: String, default: '' },
    startedAt: { type: String, default: '' },
    endsAt: { type: String, default: '' },
    grossAmount: { type: Number, default: 0, min: 0 },
    feePercentage: { type: Number, default: 0, min: 0 },
    feeAmount: { type: Number, default: 0, min: 0 },
    originalFeeAmount: { type: Number, default: 0, min: 0 },
    originalNetAmount: { type: Number, default: 0, min: 0 },
    factionCleanMoneyGainPercent: { type: Number, default: 0, min: 0 },
    factionDonationEfficiencyPercent: { type: Number, default: 0, min: 0 },
    factionBuffDurationPercent: { type: Number, default: 0, min: 0 },
    bonusCleanAmount: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, default: 0, min: 0 },
    durationSeconds: { type: Number, default: 0, min: 0 },
    serverCalculated: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['processing', 'completed'],
      default: 'processing',
    },
  },
  { _id: false }
);

const dailyOperationSchema = new mongoose.Schema(
  {
    businessId: { type: Number, required: true },
    date: { type: String, required: true },
    amount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const purchasedAccessorySchema = new mongoose.Schema(
  {
    accessoryId: { type: String, required: true },
    skillType: { type: String, required: true },
    purchasedAt: { type: String, required: true },
  },
  { _id: false }
);


const convoyAcceleratorsSchema = new mongoose.Schema(
  {
    twoX: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const barracoAcceleratorsSchema = new mongoose.Schema(
  {
    // Saldo genérico de aceleradores de construção do barraco em segundos.
    // Futuras lojas/eventos podem conceder +300, +900, +3600 etc. sem mudar o schema.
    seconds: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const barracoUpgradeSchema = new mongoose.Schema(
  {
    active: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['idle', 'building', 'ready', 'completed'],
      default: 'idle',
    },
    fromLevel: { type: Number, default: 1, min: 1, max: 100 },
    toLevel: { type: Number, default: 1, min: 1, max: 100 },
    cost: { type: Number, default: 0, min: 0 },
    durationMs: { type: Number, default: 0, min: 0 },
    startedAt: { type: String, default: null },
    endsAt: { type: String, default: null },
    completedAt: { type: String, default: null },
    acceleratedMs: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const azideiaDailySchema = new mongoose.Schema(
  {
    date: { type: String, default: '' },
    x9Kills: { type: Number, default: 0, min: 0 },
    x9FactionAcceleratorsReceived: { type: Number, default: 0, min: 0 },
    correriaNegotiations: { type: Number, default: 0, min: 0 },
    correriaFactionCorreReceived: { type: Number, default: 0, min: 0 },
    mestreObrasPayments: { type: Number, default: 0, min: 0 },
    mestreObrasFactionBarracoAcceleratorsReceived: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const convoysSchema = new mongoose.Schema(
  {
    ownedSkinIds: {
      type: [String],
      default: ['comboio_padrao'],
    },
    equippedSkinId: {
      type: String,
      default: 'comboio_padrao',
    },
  },
  { _id: false }
);

const dailyCorreSchema = new mongoose.Schema(
  {
    streak: { type: Number, default: 0, min: 0 },
    lastClaimDate: { type: String, default: '' },
    totalClaims: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const prisonHistorySchema = new mongoose.Schema(
  {
    windowStart: { type: Number, default: 0, min: 0 },
    countInWindow: { type: Number, default: 0, min: 0 },
    lastPrisonAt: { type: Number, default: 0, min: 0 },
    cooldownUntil: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const spinRateLimitSchema = new mongoose.Schema(
  {
    windowStart: { type: Number, default: 0, min: 0 },
    spinCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const giroCardSchema = new mongoose.Schema(
  {
    cardId: { type: String, required: true },
    setId: { type: String, required: true },
    name: { type: String, default: '' },
    rarity: {
      type: String,
      enum: ['common', 'rare', 'epic', 'legendary'],
      default: 'common',
    },
    quantity: { type: Number, default: 0, min: 0 },
    isGolden: { type: Boolean, default: false },
    firstCollectedAt: { type: String, default: '' },
  },
  { _id: false }
);

const giroCardCollectionSchema = new mongoose.Schema(
  {
    cards: { type: [giroCardSchema], default: [] },
    completedSets: { type: [String], default: [] },
    totalCardsCollected: { type: Number, default: 0, min: 0 },
    chests: {
      common: { type: Number, default: 0, min: 0 },
      rare: { type: Number, default: 0, min: 0 },
      epic: { type: Number, default: 0, min: 0 },
    },
  },
  { _id: false }
);


const notificationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    attackerId: { type: String, default: '' },
    attackerName: { type: String, default: '' },
    targetId: { type: String, default: '' },
    targetName: { type: String, default: '' },
    success: { type: Boolean, default: false },
    loot: { type: Number, default: 0 },
    createdAt: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  { _id: false }
);

const attackHistorySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    attackerId: { type: String, required: true },
    attackerName: { type: String, required: true },
    targetId: { type: String, required: true },
    targetName: { type: String, required: true },
    success: { type: Boolean, default: false },
    loot: { type: Number, default: 0 },
    createdAt: { type: String, required: true },
  },
  { _id: false }
);

const gangMemberSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ['capanga', 'frente', 'executor', 'assassino', 'muralha', 'certeiro', 'motorista', 'nitro'],
      required: true,
    },
    level: { type: Number, default: 1, min: 1, max: 10 },
    status: {
      type: String,
      enum: ['ativo', 'ferido', 'morto', 'treinando', 'marchando'],
      default: 'ativo',
    },
    recruitedAt: { type: String, default: () => new Date().toISOString() },
    trainingEndsAt: { type: String, default: null },
    injuryEndsAt: { type: String, default: null },
    activeAttackId: { type: String, default: null },
    marchingUntil: { type: String, default: null },
  },
  { _id: false }
);


const trainingSlotSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    ctKey: {
      type: String,
      enum: ['ct_nw', 'ct_ne', 'ct_sw', 'ct_se'],
      required: true,
    },
    troopType: {
      type: String,
      enum: ['capanga', 'frente', 'executor', 'assassino', 'muralha', 'certeiro', 'motorista', 'nitro'],
      required: true,
    },
    troopLevel: { type: Number, default: 1, min: 1, max: 10 },  // ← NOVO
    quantity: { type: Number, required: true, min: 1 },
    startedAt: { type: Number, required: true },
    endsAt: { type: Number, required: true },
    status: {
      type: String,
      enum: ['training', 'completed'],
      default: 'training',
    },
    cost: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);


const gangStatNumbersSchema = new mongoose.Schema(
  {
    rajada: { type: Number, default: 0 },
    blindagem: { type: Number, default: 0 },
    folego: { type: Number, default: 0 },
    quebra: { type: Number, default: 0 },
  },
  { _id: false }
);

const gangStatSourceSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    source: {
      type: String,
      enum: ['formacao', 'ct', 'arsenal', 'suborno', 'investimento', 'faccao', 'evento', 'manual', 'barraco', 'loja', 'item'],
      default: 'manual',
    },
    label: { type: String, default: '' },
    targetScope: {
      type: String,
      enum: ['global', 'type', 'member'],
      default: 'global',
    },
    targetType: {
      type: String,
      enum: ['capanga', 'frente', 'executor', 'assassino', 'muralha', 'certeiro', 'motorista', 'nitro', null],
      default: null,
    },
    targetMemberId: { type: String, default: null },
    percent: { type: gangStatNumbersSchema, default: () => ({}) },
    flat: { type: gangStatNumbersSchema, default: () => ({}) },
    enabled: { type: Boolean, default: true },
    expiresAt: { type: String, default: null },
    updatedAtIso: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const gangStatsSchema = new mongoose.Schema(
  {
    totalMembers: { type: Number, default: createEmptyGangStats().totalMembers, min: 0 },
    activeMembers: { type: Number, default: createEmptyGangStats().activeMembers, min: 0 },
    injuredMembers: { type: Number, default: createEmptyGangStats().injuredMembers, min: 0 },
    deadMembers: { type: Number, default: createEmptyGangStats().deadMembers, min: 0 },
    trainingMembers: { type: Number, default: createEmptyGangStats().trainingMembers, min: 0 },
    marchingMembers: { type: Number, default: createEmptyGangStats().marchingMembers, min: 0 },
    totalPower: { type: Number, default: createEmptyGangStats().totalPower, min: 0 },
    averageLevel: { type: Number, default: createEmptyGangStats().averageLevel, min: 0 },
  },
  { _id: false }
);

const gangStateSchema = new mongoose.Schema(
  {
    members: { type: [gangMemberSchema], default: createEmptyGangState().members },
    trainingSlots: { type: [trainingSlotSchema], default: createEmptyGangState().trainingSlots },
    stats: { type: gangStatsSchema, default: createEmptyGangState().stats },
    statSources: { type: [gangStatSourceSchema], default: createEmptyGangState().statSources },
    statSnapshot: { type: mongoose.Schema.Types.Mixed, default: createEmptyGangState().statSnapshot },
    updatedAtIso: { type: String, default: null },
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: '',
    },

    hp: {
      type: Number,
      default: getDefaultPlayerState().hp,
      min: 0,
    },

    factionId: {
      type: String,
      default: null,
    },

    gangId: {
      type: String,
      default: null,
    },

    niveis: {
      playerLevel: { type: Number, default: 1, min: 1 },
      barracoLevel: { type: Number, default: 1, min: 1 },
      hierarchyLevel: { type: Number, default: 1, min: 1 },
      arsenalLevel: { type: Number, default: 1, min: 1 },
      giroLevel: { type: Number, default: 1, min: 1 },
      lavagemLevel: { type: Number, default: 1, min: 1 },
      luxuryLevel: { type: Number, default: 1, min: 1 },
      briberyLevel: { type: Number, default: 1, min: 1 },
    },

    balances: {
      dirtyMoney: { type: Number, default: ECONOMY.STARTER.dirtyMoney, min: 0 },
      cleanMoney: { type: Number, default: ECONOMY.STARTER.cleanMoney, min: 0 },
      corre: { type: Number, default: ECONOMY.STARTER.corre, min: 0 },
    },

    dailyCorre: {
      type: dailyCorreSchema,
      default: () => ({ streak: 0, lastClaimDate: '', totalClaims: 0 }),
    },

    prisonHistory: {
      type: prisonHistorySchema,
      default: () => ({ windowStart: 0, countInWindow: 0, lastPrisonAt: 0, cooldownUntil: 0 }),
    },

    spinRateLimit: {
      type: spinRateLimitSchema,
      default: () => ({ windowStart: 0, spinCount: 0 }),
    },

    cardCollection: {
      type: giroCardCollectionSchema,
      default: () => ({
        cards: [],
        completedSets: [],
        totalCardsCollected: 0,
        chests: { common: 0, rare: 0, epic: 0 },
      }),
    },

    inventory: {
      items: { type: [mongoose.Schema.Types.Mixed], default: [] },
      gifts: { type: [mongoose.Schema.Types.Mixed], default: [] },
      rewards: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },

    pageLevels: {
      barraco: { type: Number, default: 1, min: 1 },
      giro: { type: Number, default: 1, min: 1 },
      lavagem: { type: Number, default: 1, min: 1 },
      luxury: { type: Number, default: 1, min: 1 },
      fuga: { type: Number, default: 1, min: 1 },
      arsenal: { type: Number, default: 1, min: 1 },
      bribery: { type: Number, default: 1, min: 1 },
      hierarchy: { type: Number, default: 1, min: 1 },
      home: { type: Number, default: 1, min: 1 },
      game: { type: Number, default: 1, min: 1 },
    },

    skills: {
      attack: { type: Number, default: 0, min: 0 },
      defense: { type: Number, default: 0, min: 0 },
      intelligence: { type: Number, default: 0, min: 0 },
      agility: { type: Number, default: 0, min: 0 },
      respect: { type: Number, default: 0, min: 0 },
      vigor: { type: Number, default: 0, min: 0 },
    },

    power: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Prestígio ganho em PvP. Não é custo nem moeda de ataque; é métrica de guerra
    // persistida para ranking/recompensas futuras.
    battlePrestige: {
      type: Number,
      default: 0,
      min: 0,
    },

    vip: {
      type: Boolean,
      default: false,
    },

    lastSkillTrainAt: {
      type: Number,
      default: 0,
    },

    lastAttackAt: {
      type: Number,
      default: 0,
    },

    hierarchyBadge: {
      type: String,
      default: 'Antena',
    },

    barracoPosition: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      z: { type: Number, default: 0 },
    },

    mapPosition: {
      tileX: { type: Number, default: 60 },
      tileY: { type: Number, default: 60 },
      worldX: { type: Number, default: 0 },
      worldY: { type: Number, default: 0 },
    },

    laundryProgress: {
      activeOperations: { type: [activeOperationSchema], default: [] },
      dailyOperations: { type: [dailyOperationSchema], default: [] },
    },

    punishments: {
      active: {
        type: [
          {
            type: {
              type: String,
              enum: ['fiscal', 'arsenal', 'militia', 'blitz', 'threat'],
            },
            expiresAt: String,
          },
        ],
        default: [],
      },
      delacao: {
        active: { type: Boolean, default: false },
        expiresAt: { type: String, default: null },
      },
      inventoryBlocked: { type: Boolean, default: false },
      dirtyMoneyBlocked: { type: Boolean, default: false },
      cleanMoneyBlocked: { type: Boolean, default: false },
      levelProgressionBlocked: { type: Boolean, default: false },
      inventoryBonusReductionPercent: { type: Number, default: 0, min: 0 },
      pvpProtectionUntil: { type: String, default: null },
      delacaoRewardPending: { type: Boolean, default: false },
      delacaoRewardUnlockAt: { type: String, default: null },
      pendingSkillBoost: { type: Number, default: 0, min: 0 },
      lastVehicleLost: { type: Boolean, default: false },
    },

    skillBoostMultiplier: {
      type: Number,
      default: 1,
      min: 0,
    },

    headerCustomization: {
      playerNameFont: { type: String, default: 'oswald' },
      playerNameFontSize: { type: String, default: '1.875rem' },
      playerNameColor: { type: String, default: '#1a1205' },
      customName: { type: String, default: '', trim: true, maxlength: 30 },
      customAvatar: { type: String, default: '' },
    },

    ownedVehicles: {
      type: [String],
      default: [],
    },

    purchasedAccessories: {
      type: [purchasedAccessorySchema],
      default: [],
    },

    accessories: {
      vehicles: { type: Object, default: {} },
      weapons: { type: Object, default: {} },
    },

    convoyAccelerators: {
      type: convoyAcceleratorsSchema,
      default: () => ({ twoX: 0 }),
    },

    barracoAccelerators: {
      type: barracoAcceleratorsSchema,
      default: () => ({ seconds: 0 }),
    },

    barracoUpgrade: {
      type: barracoUpgradeSchema,
      default: () => ({
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
      }),
    },

    azideiaDaily: {
      type: azideiaDailySchema,
      default: () => ({
        date: '',
        x9Kills: 0,
        x9FactionAcceleratorsReceived: 0,
        correriaNegotiations: 0,
        correriaFactionCorreReceived: 0,
        mestreObrasPayments: 0,
        mestreObrasFactionBarracoAcceleratorsReceived: 0,
      }),
    },

    // Comboios visuais comprados/equipados para animação de ataque.
    convoys: {
      type: convoysSchema,
      default: () => ({
        ownedSkinIds: ['comboio_padrao'],
        equippedSkinId: 'comboio_padrao',
      }),
    },

    notifications: {
      type: [notificationSchema],
      default: [],
    },

    attackHistory: {
      type: [attackHistorySchema],
      default: [],
    },

    gang: {
      type: gangStateSchema,
      default: createEmptyGangState(),
    },

    version: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastPassiveIncomeAt: {
      type: Number,
      default: () => Date.now(),
    },

    lastSpinAt: {
      type: Number,
      default: 0,
    },

    // ─── Defesa: escudo de proteção contra ataques ─────────────────────────
    // shieldExpiresAt: epoch ms. Se > Date.now(), defensor protegido.
    // shieldSource: 'novato' (7d ao criar conta), 'derrota' (8h pós perda >30%),
    //               'pacote' (futuro, comprado na loja).
    shieldExpiresAt: {
      type: Number,
      default: 0,
    },
    shieldSource: {
      type: String,
      enum: ['novato', 'derrota', 'pacote', null],
      default: null,
    },

    // ─── Cooldown 24h por alvo ─────────────────────────────────────────────
    // Mapa { attackerId → epoch ms do último ataque }.
    // Validado em startBattle. Limpeza lazy: entradas antigas só são ignoradas.
    lastAttacksAgainst: {
      type: Map,
      of: Number,
      default: () => new Map(),
    },

    // ─── Modificadores para pacotes/investimentos futuros ──────────────────
    combatModifiers: {
      velocityBonus:      { type: Number, default: 0,   min: 0, max: 0.9 },
      capacityBonus:      { type: Number, default: 0,   min: 0 },
      cooldownMultiplier: { type: Number, default: 1,   min: 0.1, max: 1.0 },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

playerSchema.index(
  { 'mapPosition.tileX': 1, 'mapPosition.tileY': 1 },
  { unique: true, sparse: true }
);

// Índices de leitura pesada do mapa/facção. Mantém snapshot e consultas de
// recompensa sem varrer a coleção inteira quando houver muitos jogadores.
playerSchema.index({ 'mapPosition.tileY': 1, 'mapPosition.tileX': 1, _id: 1 });
playerSchema.index({ factionId: 1 });
playerSchema.index({ gangId: 1 });

const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);

export default Player;