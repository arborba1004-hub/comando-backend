import mongoose from 'mongoose';

const azideiaTargetSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['x9', 'correria'], required: true, index: true },
    name: { type: String, default: 'X9' },
    modelUrl: { type: String, default: '' },
    tileX: { type: Number, required: true, min: 0, max: 119 },
    tileY: { type: Number, required: true, min: 0, max: 119 },
    active: { type: Boolean, default: true, index: true },
    reservedByPlayerId: { type: String, default: null, index: true },
    reservedByMissionId: { type: String, default: null, index: true },
    reservedAt: { type: String, default: null },
    spawnedAt: { type: String, default: () => new Date().toISOString() },
    killedByPlayerId: { type: String, default: null, index: true },
    killedByPlayerName: { type: String, default: null },
    killedAt: { type: String, default: null },
  },
  { timestamps: true, versionKey: false }
);

azideiaTargetSchema.index({ type: 1, active: 1 });
azideiaTargetSchema.index({ type: 1, active: 1, reservedByPlayerId: 1 });
azideiaTargetSchema.index({ tileX: 1, tileY: 1, active: 1 });

export default mongoose.models.AzideiaTarget || mongoose.model('AzideiaTarget', azideiaTargetSchema);
