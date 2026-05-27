import mongoose from 'mongoose';

const azideiaRewardBatchSchema = new mongoose.Schema(
  {
    factionId: { type: String, required: true, index: true },
    rewardType: { type: String, enum: ['convoy_2x', 'corre', 'barraco_time'], required: true, index: true },
    quantityPerMember: { type: Number, default: 1, min: 1 },
    memberIds: { type: [String], default: [], index: true },
    claimedBy: { type: [String], default: [] },
    sourceMissionId: { type: String, default: '', index: true },
    sourceTargetType: { type: String, enum: ['x9', 'correria', 'mestre_obras'], default: 'x9' },
    sourceTargetId: { type: String, default: '' },
    killerId: { type: String, required: true, index: true },
    killerName: { type: String, default: 'Jogador' },
    createdAtIso: { type: String, default: () => new Date().toISOString() },
  },
  { timestamps: true, versionKey: false }
);

azideiaRewardBatchSchema.index({ factionId: 1, rewardType: 1, createdAt: -1 });
azideiaRewardBatchSchema.index({ factionId: 1, memberIds: 1, claimedBy: 1 });
azideiaRewardBatchSchema.index({ sourceMissionId: 1, rewardType: 1 }, { sparse: true });
azideiaRewardBatchSchema.index({ sourceTargetType: 1, sourceTargetId: 1, killerId: 1, rewardType: 1 });

export default mongoose.models.AzideiaRewardBatch || mongoose.model('AzideiaRewardBatch', azideiaRewardBatchSchema);
