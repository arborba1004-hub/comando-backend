import mongoose from 'mongoose';

const VALID_MEMBER_TYPES = [
  'capanga',
  'frente',
  'executor',
  'muralha',
  'certeiro',
  'motorista',
  'nitro',
  'armeiro',
  'informante',
  'wifi',
  'medico',
  'lavador',
  'negociador',
];

const gangUnitSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: VALID_MEMBER_TYPES, required: true, Index: true },
    level: { type: Number, default: 1, min: 1, max: 10 },
    status: {
      type: String,
      enum: ['ativo', 'ferido', 'morto', 'treinando'],
      default: 'ativo',
      
    },
    recruitedAt: { type: Date, required: true, default: Date.now },
    trainingEndsAt: { type: Date, default: null },
    injuryEndsAt: { type: Date, default: null },
    lastBattleAt: { type: Date, default: null },
  },
  { _id: false }
);

const gangTrainingJobSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    batchId: { type: String, required: true, index: true },
    memberIds: { type: [String], default: [] },
    memberType: { type: String, enum: VALID_MEMBER_TYPES, required: true },
    quantity: { type: Number, required: true, min: 1 },
    fromLevel: { type: Number, default: 0, min: 0, max: 9 },
    toLevel: { type: Number, default: 1, min: 1, max: 10 },
    costDirtyMoney: { type: Number, default: 0, min: 0 },
    startedAt: { type: Date, required: true, default: Date.now },
    endsAt: { type: Date, required: true },
    completed: { type: Boolean, default: false, index: true },
  },
  { _id: false }
);

const gangWarSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      unique: true,
      index: true,
    },
    ct: {
      level: { type: Number, default: 1, min: 1, max: 10 },
      maxLevel: { type: Number, default: 10 },
      trainingSlots: { type: Number, default: 7, min: 1, max: 7 },
      recoveryBonusPercent: { type: Number, default: 0, min: 0 },
      trainingSpeedBonusPercent: { type: Number, default: 0, min: 0 },
      gangCapacityBonus: { type: Number, default: 0, min: 0 },
    },
    members: { type: [gangUnitSchema], default: [] },
    trainingJobs: { type: [gangTrainingJobSchema], default: [] },
    formation: {
      type: String,
      enum: ['pressao_total', 'linha_fechada', 'bote_certo', 'cerco', 'saque_rapido'],
      default: 'pressao_total',
      index: true,
    },
    version: { type: Number, default: 3, min: 1 },
    lastMaintenanceDate: { type: Date, default: null },
  },
  {
    timestamps: true,
    collection: 'gangwars',
    versionKey: false,
  }
);

gangWarSchema.index({ 'members.status': 1 });
gangWarSchema.index({ 'members.type': 1 });
gangWarSchema.index({ 'trainingJobs.completed': 1, 'trainingJobs.endsAt': 1 });

const GangWar = mongoose.models.GangWar || mongoose.model('GangWar', gangWarSchema);

export default GangWar;
