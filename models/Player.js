import mongoose from 'mongoose';

const skillSchema = new mongoose.Schema(
  {
    attack: { type: Number, default: 1, min: 1 },
    defense: { type: Number, default: 1, min: 1 },
    intelligence: { type: Number, default: 1, min: 1 },
    agility: { type: Number, default: 1, min: 1 },
    respect: { type: Number, default: 1, min: 1 },
    vigor: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const levelSchema = new mongoose.Schema(
  {
    playerLevel: { type: Number, default: 1, min: 1 },
    barracoLevel: { type: Number, default: 1, min: 1 },
    hierarchyLevel: { type: Number, default: 1, min: 1 },
    arsenalLevel: { type: Number, default: 1, min: 1 },
    giroLevel: { type: Number, default: 1, min: 1 },
    lavagemLevel: { type: Number, default: 1, min: 1 },
    luxuryLevel: { type: Number, default: 1, min: 1 },
    briberyLevel: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const mapPositionSchema = new mongoose.Schema(
  {
    tileX: { type: Number, default: 20 },
    tileY: { type: Number, default: 10 },
    worldX: { type: Number, default: 0 },
    worldY: { type: Number, default: 0 },
  },
  { _id: false }
);

const inventorySchema = new mongoose.Schema(
  {
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    gifts: { type: [mongoose.Schema.Types.Mixed], default: [] },
    rewards: { type: [mongoose.Schema.Types.Mixed], default: [] },
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

    dirtyMoney: {
      type: Number,
      default: 0,
      min: 0,
    },
    cleanMoney: {
      type: Number,
      default: 0,
      min: 0,
    },
    corre: {
      type: Number,
      default: 100,
      min: 0,
    },

    hp: {
      type: Number,
      default: 100,
      min: 0,
    },

    niveis: {
      type: levelSchema,
      default: () => ({}),
    },

    skills: {
      type: skillSchema,
      default: () => ({}),
    },

    inventory: {
      type: inventorySchema,
      default: () => ({}),
    },

    mapPosition: {
      type: mapPositionSchema,
      default: () => ({}),
    },

    power: {
      type: Number,
      default: 0,
      min: 0,
    },

    hierarchyBadge: {
      type: String,
      default: 'Soldado',
    },

    lastLoginAt: {
      type: Date,
      default: Date.now,
    },

    lastPassiveIncomeAt: {
      type: Date,
      default: Date.now,
    },

    lastSpinAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

playerSchema.index(
  { 'mapPosition.tileX': 1, 'mapPosition.tileY': 1 },
  { unique: false }
);

const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);

export default Player;
