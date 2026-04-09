import mongoose from 'mongoose';

const attackSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    attackerId: { type: String, required: true, index: true },
    attackerName: { type: String, required: true },
    targetId: { type: String, required: true, index: true },
    targetName: { type: String, required: true },
    success: { type: Boolean, default: false },
    critical: { type: Boolean, default: false },
    loot: { type: Number, default: 0, min: 0 },
    chance: { type: Number, default: 0 },
    attackerPower: { type: Number, default: 0 },
    defenderPower: { type: Number, default: 0 },
    message: { type: String, default: '' },
    createdAtIso: { type: String, default: () => new Date().toISOString() },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Attack = mongoose.models.Attack || mongoose.model('Attack', attackSchema);

export default Attack;