import mongoose from 'mongoose';

const qgEventParticipantSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true, index: true },
    playerName: { type: String, default: 'Jogador' },
    avatar: { type: String, default: '' },
    factionId: { type: String, required: true, index: true },
    factionName: { type: String, default: '' },
    factionTag: { type: String, default: '' },
    score: { type: Number, default: 0, min: 0 },
    heat: { type: Number, default: 0, min: 0 },
    actions: { type: mongoose.Schema.Types.Mixed, default: {} },
    cooldowns: { type: mongoose.Schema.Types.Mixed, default: {} },
    joinedAt: { type: String, default: () => new Date().toISOString() },
    lastActionAt: { type: String, default: null },
    rewardClaimedAt: { type: String, default: null },
    reward: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const qgEventFactionScoreSchema = new mongoose.Schema(
  {
    factionId: { type: String, required: true, index: true },
    factionName: { type: String, default: '' },
    factionTag: { type: String, default: '' },
    score: { type: Number, default: 0, min: 0 },
    heat: { type: Number, default: 0, min: 0 },
    participants: { type: Number, default: 0, min: 0 },
    lastActionAt: { type: String, default: null },
  },
  { _id: false }
);

const qgEventSchema = new mongoose.Schema(
  {
    slug: { type: String, default: 'tomada_qg', index: true },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'settled', 'cancelled'],
      default: 'active',
      index: true,
    },
    phase: { type: String, default: 'preparation' },
    title: { type: String, default: 'Tomada do QG' },
    startedByPlayerId: { type: String, default: '' },
    startedByPlayerName: { type: String, default: '' },
    startsAt: { type: String, required: true },
    endsAt: { type: String, required: true },
    settledAt: { type: String, default: null },
    winnerFactionId: { type: String, default: null, index: true },
    winnerFactionName: { type: String, default: '' },
    winnerFactionTag: { type: String, default: '' },
    participants: { type: [qgEventParticipantSchema], default: [] },
    factions: { type: [qgEventFactionScoreSchema], default: [] },
    rewardsGranted: { type: Boolean, default: false },
    rewardSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
    activityLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

qgEventSchema.index({ status: 1, startsAt: -1 });
qgEventSchema.index({ slug: 1, status: 1 });

export default mongoose.models.QgEvent || mongoose.model('QgEvent', qgEventSchema);
