import mongoose from 'mongoose';

const selectedTroopSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

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

    success: { type: Boolean, default: null },
    critical: { type: Boolean, default: null },
    loot: { type: Number, default: 0, min: 0 },
    chance: { type: Number, default: 0 },

    attackerPower: { type: Number, default: 0 },
    defenderPower: { type: Number, default: 0 },

    attackerSnapshot: { type: Object, default: {} },
    defenderSnapshot: { type: Object, default: {} },

    attackerDirtyMoneyDelta: { type: Number, default: 0 },
    defenderDirtyMoneyDelta: { type: Number, default: 0 },

    attackerGangStats: { type: Object, default: null },
    defenderGangStats: { type: Object, default: null },
    attackerGangLosses: { type: Object, default: null },
    defenderGangLosses: { type: Object, default: null },

    selectedTroops: { type: [selectedTroopSchema], default: [] },
    selectedMemberIds: { type: [String], default: [] },

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
