import mongoose from 'mongoose';

const attackSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      enum: ['started', 'resolved'],
      default: 'started',
      index: true,
    },

    attackerId: { type: String, required: true, index: true },
    attackerName: { type: String, required: true },

    targetId: { type: String, required: true, index: true },
    targetName: { type: String, required: true },

    attackerFactionId: { type: String, default: null },
    attackerFactionName: { type: String, default: '' },
    attackerFactionTag: { type: String, default: '' },

    defenderFactionId: { type: String, default: null },
    defenderFactionName: { type: String, default: '' },
    defenderFactionTag: { type: String, default: '' },

    origin: {
      tileX: { type: Number, default: 0 },
      tileY: { type: Number, default: 0 },
    },

    target: {
      tileX: { type: Number, default: 0 },
      tileY: { type: Number, default: 0 },
    },

    success: { type: Boolean, default: false },
    critical: { type: Boolean, default: false },
    loot: { type: Number, default: 0, min: 0 },
    chance: { type: Number, default: 0 },

    attackerPower: { type: Number, default: 0 },
    defenderPower: { type: Number, default: 0 },

    attackerSnapshot: {
      level: { type: Number, default: 1 },
      power: { type: Number, default: 0 },
      dirtyMoney: { type: Number, default: 0 },
      corre: { type: Number, default: 0 },
      skills: { type: Object, default: {} },
      barracoLevel: { type: Number, default: 1 },
      hierarchyLevel: { type: Number, default: 1 },
      arsenalLevel: { type: Number, default: 1 },
    },

    defenderSnapshot: {
      level: { type: Number, default: 1 },
      power: { type: Number, default: 0 },
      dirtyMoney: { type: Number, default: 0 },
      corre: { type: Number, default: 0 },
      skills: { type: Object, default: {} },
      barracoLevel: { type: Number, default: 1 },
      hierarchyLevel: { type: Number, default: 1 },
      arsenalLevel: { type: Number, default: 1 },
    },

    attackerDirtyMoneyDelta: { type: Number, default: 0 },
    defenderDirtyMoneyDelta: { type: Number, default: 0 },
    attackerCorreDelta: { type: Number, default: 0 },
    defenderCorreDelta: { type: Number, default: 0 },

    attackerFactionAttackBonusPercent: { type: Number, default: 0 },
    attackerFactionAgilityBonusPercent: { type: Number, default: 0 },
    attackerFactionIntelligenceBonusPercent: { type: Number, default: 0 },
    defenderFactionDefenseBonusPercent: { type: Number, default: 0 },
    defenderFactionBaseDefenseBonusPercent: { type: Number, default: 0 },
    defenderFactionHpBonusPercent: { type: Number, default: 0 },

    attackerGangMembers: { type: Array, default: [] },
    attackerGangStats: { type: Object, default: null },
    attackerCTLevel: { type: Number, default: 1 },

    attackerGangLosses: { type: Object, default: null },
    defenderGangLosses: { type: Object, default: null },
    defenderGangStats: { type: Object, default: null },

    message: { type: String, default: '' },
    createdAtIso: { type: String, default: () => new Date().toISOString() },
    resolvedAtIso: { type: String, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Attack = mongoose.models.Attack || mongoose.model('Attack', attackSchema);

export default Attack;