import mongoose from 'mongoose';

const azideiaRewardBatchSchema = new mongoose.Schema(
  {
    factionId: { type: String, required: true, index: true },
    rewardType: { type: String, enum: ['convoy_2x'], required: true, index: true },
    quantityPerMember: { type: Number, default: 1, min: 1 },
    memberIds: { type: [String], default: [], index: true },
    claimedBy: { type: [String], default: [] },
    sourceTargetType: { type: String, enum: ['x9'], default: 'x9' },
    sourceTargetId: { type: String, default: '' },
    killerId: { type: String, required: true, index: true },
    killerName: { type: String, default: 'Jogador' },
    createdAtIso: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true, versionKey: false }
);

azideiaRewardBatchSchema.index({ factionId: 1, rewardType: 1, createdAt: -1 });
azideiaRewardBatchSchema.index({ factionId: 1, memberIds: 1, claimedBy: 1 });

export default mongoose.models.AzideiaRewardBatch || mongoose.model('AzideiaRewardBatch', azideiaRewardBatchSchema);
