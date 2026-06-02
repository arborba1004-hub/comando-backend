import mongoose from 'mongoose';

const qgGarrisonGroupSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    playerId: { type: String, required: true, index: true },
    playerName: { type: String, default: 'Jogador' },
    factionId: { type: String, required: true, index: true },
    factionName: { type: String, default: '' },
    factionTag: { type: String, default: '' },
    memberIds: { type: [String], default: [] },
    selection: { type: mongoose.Schema.Types.Mixed, default: {} },
    power: { type: Number, default: 0, min: 0 },
    originalCount: { type: Number, default: 0, min: 0 },
    activeCount: { type: Number, default: 0, min: 0 },
    joinedAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const qgLocationStateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    kind: { type: String, enum: ['qg', 'ct'], default: 'ct' },
    name: { type: String, default: '' },
    occupantFactionId: { type: String, default: null, index: true },
    occupantFactionName: { type: String, default: '' },
    occupantFactionTag: { type: String, default: '' },
    occupiedSince: { type: String, default: null },
    lastControlChangeAt: { type: String, default: null },
    capacity: { type: Number, default: 0, min: 0 },
    firstOccupantPlayerId: { type: String, default: '' },
    firstOccupantPlayerName: { type: String, default: '' },
    garrison: { type: [qgGarrisonGroupSchema], default: [] },
    lastCtDamageTickAt: { type: String, default: null },
    totalDamageDealt: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const qgParticipantSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true, index: true },
    playerName: { type: String, default: 'Jogador' },
    avatar: { type: String, default: '' },
    factionId: { type: String, required: true, index: true },
    factionName: { type: String, default: '' },
    factionTag: { type: String, default: '' },
    contribution: { type: Number, default: 0, min: 0 },
    qgCaptures: { type: Number, default: 0, min: 0 },
    ctCaptures: { type: Number, default: 0, min: 0 },
    defensesWon: { type: Number, default: 0, min: 0 },
    troopsSent: { type: Number, default: 0, min: 0 },
    troopsLost: { type: Number, default: 0, min: 0 },
    lastActionAt: { type: String, default: null },
    joinedAt: { type: String, default: () => new Date().toISOString() },
    reward: { type: mongoose.Schema.Types.Mixed, default: null },
    rewardGrantedAt: { type: String, default: null },
  },
  { _id: false }
);

const qgFactionScoreSchema = new mongoose.Schema(
  {
    factionId: { type: String, required: true, index: true },
    factionName: { type: String, default: '' },
    factionTag: { type: String, default: '' },
    contribution: { type: Number, default: 0, min: 0 },
    qgHoldMs: { type: Number, default: 0, min: 0 },
    qgMaxContinuousHoldMs: { type: Number, default: 0, min: 0 },
    qgCaptures: { type: Number, default: 0, min: 0 },
    ctCaptures: { type: Number, default: 0, min: 0 },
    ctDamageDealt: { type: Number, default: 0, min: 0 },
    participants: { type: Number, default: 0, min: 0 },
    lastActionAt: { type: String, default: null },
  },
  { _id: false }
);

const qgMandateRoleSchema = new mongoose.Schema(
  {
    roleId: { type: String, required: true },
    title: { type: String, default: '' },
    playerId: { type: String, default: '' },
    playerName: { type: String, default: '' },
    assignedByPlayerId: { type: String, default: '' },
    assignedAt: { type: String, default: null },
  },
  { _id: false }
);

const qgMandateSchema = new mongoose.Schema(
  {
    factionId: { type: String, default: null, index: true },
    factionName: { type: String, default: '' },
    factionTag: { type: String, default: '' },
    startsAt: { type: String, default: null },
    endsAt: { type: String, default: null },
    appointmentEndsAt: { type: String, default: null },
    roles: { type: [qgMandateRoleSchema], default: [] },
    rewardsGranted: { type: Boolean, default: false },
    statSourcesAppliedAt: { type: String, default: null },
    abilityUses: { type: [mongoose.Schema.Types.Mixed], default: [] },
    packagesSent: { type: [mongoose.Schema.Types.Mixed], default: [] },
    servants: { type: [mongoose.Schema.Types.Mixed], default: [] },
    activeDecrees: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const qgEventSchema = new mongoose.Schema(
  {
    slug: { type: String, default: 'tomada_qg', index: true },
    status: {
      type: String,
      enum: ['scheduled', 'active', 'appointment', 'mandate', 'closed', 'cancelled'],
      default: 'scheduled',
      index: true,
    },
    title: { type: String, default: 'Tomada do QG' },
    startsAt: { type: String, required: true, index: true },
    endsAt: { type: String, required: true },
    appointmentEndsAt: { type: String, default: null },
    mandateEndsAt: { type: String, default: null },
    settledAt: { type: String, default: null },
    closedAt: { type: String, default: null },
    winnerFactionId: { type: String, default: null, index: true },
    winnerFactionName: { type: String, default: '' },
    winnerFactionTag: { type: String, default: '' },
    winnerReason: { type: String, default: '' },
    lastTickAt: { type: String, default: null },
    locations: { type: [qgLocationStateSchema], default: [] },
    participants: { type: [qgParticipantSchema], default: [] },
    factions: { type: [qgFactionScoreSchema], default: [] },
    mandate: { type: qgMandateSchema, default: () => ({}) },
    rewardSummary: { type: mongoose.Schema.Types.Mixed, default: {} },
    activityLog: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

qgEventSchema.index({ slug: 1, status: 1, startsAt: -1 });
qgEventSchema.index({ status: 1, startsAt: 1 });

export default mongoose.models.QgEvent || mongoose.model('QgEvent', qgEventSchema);
