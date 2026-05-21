import mongoose from 'mongoose';
import {
  getDefaultPlayerState,
  createEmptyGangState,
  createEmptyGangStats,
} from '../utils/playerDefaults.js';

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
    netAmount: { type: Number, default: 0, min: 0 },
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

const azideiaDailySchema = new mongoose.Schema(
  {
    date: { type: String, default: '' },
    x9Kills: { type: Number, default: 0, min: 0 },
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
      dirtyMoney: { type: Number, default: 1000, min: 0 },
      cleanMoney: { type: Number, default: 0, min: 0 },
      corre: { type: Number, default: 1000, min: 0 },
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

    azideiaDaily: {
      type: azideiaDailySchema,
      default: () => ({ date: '', x9Kills: 0 }),
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

const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);

export default Player;