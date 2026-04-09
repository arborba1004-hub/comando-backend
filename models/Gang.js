import mongoose from 'mongoose';

const memberSkillSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    description: String,
    level: Number,
    maxLevel: Number,
    effect: String,
  },
  { _id: false }
);

const gangMemberSchema = new mongoose.Schema(
  {
    id: String,
    name: String,
    class: String,
    rarity: String,
    level: Number,
    exp: Number,
    expToNext: Number,
    loyalty: Number,
    skills: { type: [memberSkillSchema], default: [] },
    equipment: {
      weaponId: String,
      armorId: String,
      vehicleId: String,
    },
    active: Boolean,
    recruitedAt: String,
    lastMissionAt: String,
    victories: Number,
    defeats: Number,
  },
  { _id: false }
);

const gangSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    tag: { type: String, required: true, unique: true, index: true },
    leaderId: { type: String, required: true, index: true },
    level: { type: Number, default: 1, min: 1 },
    exp: { type: Number, default: 0, min: 0 },
    expToNext: { type: Number, default: 100, min: 1 },
    slots: { type: Number, default: 5, min: 1 },
    treasury: {
      dirtyMoney: { type: Number, default: 0, min: 0 },
      cleanMoney: { type: Number, default: 0, min: 0 },
      corre: { type: Number, default: 0, min: 0 },
    },
    members: { type: [gangMemberSchema], default: [] },
    activeMemberIds: { type: [String], default: [] },
    upgrades: {
      trainingGroundsLevel: { type: Number, default: 0, min: 0 },
      hideoutLevel: { type: Number, default: 0, min: 0 },
      blackMarketLevel: { type: Number, default: 0, min: 0 },
    },
    createdAtIso: {
      type: String,
      default: () => new Date().toISOString(),
    },
    totalVictories: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Gang = mongoose.models.Gang || mongoose.model('Gang', gangSchema);

export default Gang;