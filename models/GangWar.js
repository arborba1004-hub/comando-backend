import mongoose from 'mongoose';

const gangUnitSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // Recomendo usar UUID

    type: {
      type: String,
      required: true,
      enum: [
        'capanga', 'frente', 'executor', 'assassino', 'muralha', 'certeiro',
        'motorista', 'nitro', 'armeiro', 'informante', 'wifi', 'medico',
        'lavador', 'ladrao', 'negociador',
      ],
      index: true,
    },

    level: { type: Number, required: true, min: 1, max: 10, default: 1 },

    status: {
      type: String,
      required: true,
      enum: ['ativo', 'ferido', 'morto', 'treinando'],
      default: 'ativo',
      index: true,
    },

    recruitedAt: { type: Date, required: true },
    trainingEndsAt: { type: Date, default: null },
    injuryEndsAt: { type: Date, default: null },
    lastBattleAt: { type: Date, default: null },
  },
  { _id: false }
);

const gangTrainingJobSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },

    memberId: { type: String, required: true },
    memberType: { type: String, required: true, enum: gangUnitSchema.path('type').enumValues },

    fromLevel: { type: Number, required: true, min: 1, max: 9 },
    toLevel: { type: Number, required: true, min: 2, max: 10 },

    costDirtyMoney: { type: Number, required: true, min: 0 },

    startedAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },

    completed: { type: Boolean, default: false },
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
      level: { type: Number, required: true, default: 1, min: 1, max: 10 },
      maxLevel: { type: Number, required: true, default: 10 },
      trainingSlots: { type: Number, required: true, default: 1, min: 1 },
      recoveryBonusPercent: { type: Number, required: true, default: 0 },
      trainingSpeedBonusPercent: { type: Number, required: true, default: 0 },
      gangCapacityBonus: { type: Number, required: true, default: 0 },
    },

    members: [gangUnitSchema],
    trainingJobs: [gangTrainingJobSchema],

    lastMaintenanceDate: { type: Date, default: null },

    formation: {
      type: String,
      enum: ['pressao_total', 'linha_fechada', 'bote_certo', 'cerco', 'saque_rapido'],
      default: 'pressao_total',
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'gangwars', // nome da coleção explícito (boa prática)
  }
);

// Índices úteis para performance
gangWarSchema.index({ 'members.status': 1 });
gangWarSchema.index({ 'trainingJobs.endsAt': 1, 'trainingJobs.completed': 1 });
gangWarSchema.index({ 'ct.level': 1 });

// Virtuals úteis
gangWarSchema.virtual('activeMembersCount').get(function () {
  return this.members.filter(m => m.status === 'ativo').length;
});

gangWarSchema.virtual('availableSlots').get(function () {
  const activeJobs = this.trainingJobs.filter(j => !j.completed).length;
  return Math.max(0, this.ct.trainingSlots - activeJobs);
});

const GangWar = mongoose.models.GangWar || mongoose.model('GangWar', gangWarSchema);

export default GangWar;