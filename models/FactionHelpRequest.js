import mongoose from 'mongoose';

const factionHelpRequestSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    factionId: { type: String, required: true, index: true },
    requesterId: { type: String, required: true, index: true },
    requesterName: { type: String, default: 'Jogador' },

    message: { type: String, default: 'Família, fortalece no corre aí 🙏' },

    helpCount: { type: Number, default: 0, min: 0 },
    maxHelps: { type: Number, default: 10, min: 1 },

    helperIds: { type: [String], default: [] },

    rewardPerHelp: { type: Number, default: 1, min: 0 },
    totalRewardGranted: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ['active', 'completed', 'expired'],
      default: 'active',
      index: true,
    },

    requestDate: { type: String, required: true, index: true }, // YYYY-MM-DD
    createdAtIso: { type: String, default: () => new Date().toISOString() },
    completedAtIso: { type: String, default: '' },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

factionHelpRequestSchema.index({ factionId: 1, requestDate: -1, createdAt: -1 });
factionHelpRequestSchema.index({ requesterId: 1, requestDate: -1 });

const FactionHelpRequest =
  mongoose.models.FactionHelpRequest ||
  mongoose.model('FactionHelpRequest', factionHelpRequestSchema);

export default FactionHelpRequest;