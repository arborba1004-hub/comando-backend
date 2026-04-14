import mongoose from 'mongoose';

const gangUnitSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: [
        'capanga',
        'frente',
        'executor',
        'assassino',
        'muralha',
        'certeiro',
        'motorista',
        'nitro',
        'armeiro',
        'informante',
        'wifi',
        'medico',
        'lavador',
        'ladrao',
        'negociador',
      ],
    },
    level: { type: Number, required: true, min: 1, max: 10, default: 1 },
    status: {
      type: String,
      required: true,
      enum: ['ativo', 'ferido', 'morto', 'treinando'],
      default: 'ativo',
    },
    recruitedAt: { type: String, required: true },
    trainingEndsAt: { type: String, default: null },
    injuryEndsAt: { type: String, default: null },
    lastBattleAt: { type: String, default: null },
  },
  { _id: false }
);

const gangTrainingJobSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    memberId: { type: String, required: true },
    memberType: { type: String, required: true },
    fromLevel: { type: Number, required: true },
    toLevel: { type: Number, required: true },
    costDirtyMoney: { type: Number, required: true },
    startedAt: { type: String, required: true },
    endsAt: { type: String, required: true },
    completed: { type: Boolean, required: true, default: false },
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
      level: { type: Number, required: true, default: 1 },
      maxLevel: { type: Number, required: true, default: 10 },
      trainingSlots: { type: Number, required: true, default: 1 },
      recoveryBonusPercent: { type: Number, required: true, default: 0 },
      trainingSpeedBonusPercent: { type: Number, required: true, default: 0 },
      gangCapacityBonus: { type: Number, required: true, default: 0 },
    },
    members: {
      type: [gangUnitSchema],
      default: [],
    },
    trainingJobs: {
      type: [gangTrainingJobSchema],
      default: [],
    },
    lastMaintenanceDate: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const GangWar = mongoose.models.GangWar || mongoose.model('GangWar', gangWarSchema);

export default GangWar;