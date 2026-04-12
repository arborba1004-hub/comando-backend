import mongoose from 'mongoose';

const factionPermissionsSchema = new mongoose.Schema(
  {
    canInvite: { type: Boolean, default: false },
    canAcceptRequests: { type: Boolean, default: false },
    canManageTreasury: { type: Boolean, default: false },
    canManageInvestments: { type: Boolean, default: false },
    canManageDiplomacy: { type: Boolean, default: false },
    canStartEvents: { type: Boolean, default: false },
  },
  { _id: false }
);

const factionContributionSchema = new mongoose.Schema(
  {
    dirtyMoney: { type: Number, default: 0 },
    cleanMoney: { type: Number, default: 0 },
    corre: { type: Number, default: 0 },
    totalValue: { type: Number, default: 0 },
  },
  { _id: false }
);

const factionMemberSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    playerName: { type: String, default: 'Jogador' },
    avatar: { type: String, default: '' },
    role: {
      type: String,
      enum: ['leader', 'subleader', 'recruiter', 'treasurer', 'diplomat', 'member'],
      default: 'member',
    },
    joinedAt: { type: String, default: () => new Date().toISOString() },
    lastSeenAt: { type: String, default: () => new Date().toISOString() },
    power: { type: Number, default: 0 },
    barracoLevel: { type: Number, default: 1 },
    hierarchyBadge: { type: String, default: '' },
    permissions: {
      type: factionPermissionsSchema,
      default: () => ({
        canInvite: false,
        canAcceptRequests: false,
        canManageTreasury: false,
        canManageInvestments: false,
        canManageDiplomacy: false,
        canStartEvents: false,
      }),
    },
    contribution: {
      type: factionContributionSchema,
      default: () => ({
        dirtyMoney: 0,
        cleanMoney: 0,
        corre: 0,
        totalValue: 0,
      }),
    },
  },
  { _id: false }
);

const factionJoinRequestSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    playerName: { type: String, default: 'Jogador' },
    avatar: { type: String, default: '' },
    power: { type: Number, default: 0 },
    barracoLevel: { type: Number, default: 1 },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const factionInviteSchema = new mongoose.Schema(
  {
    playerId: { type: String, required: true },
    playerName: { type: String, default: 'Jogador' },
    invitedByPlayerId: { type: String, required: true },
    invitedByPlayerName: { type: String, default: 'Jogador' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    expiresAt: { type: String, default: () => new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString() },
  },
  { _id: false }
);

const factionBuffSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    type: { type: String, default: '' },
    value: { type: Number, default: 0 },
    startedAt: { type: String, default: () => new Date().toISOString() },
    endsAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const factionInvestmentLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    branch: {
      type: String,
      enum: [
        'arsenalColetivo',
        'caixaOperacional',
        'mobilidade',
        'influencia',
        'inteligencia',
        'fortificacao',
        'logistica',
        'doutrina',
      ],
      required: true,
    },
    levelBefore: { type: Number, default: 0 },
    levelAfter: { type: Number, default: 0 },
    cost: {
      dirtyMoney: { type: Number, default: 0 },
      cleanMoney: { type: Number, default: 0 },
      corre: { type: Number, default: 0 },
    },
    upgradedByPlayerId: { type: String, required: true },
    upgradedByPlayerName: { type: String, default: 'Jogador' },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const factionActivityLogSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, required: true },
    actorPlayerId: { type: String, default: '' },
    actorPlayerName: { type: String, default: '' },
    targetPlayerId: { type: String, default: '' },
    targetPlayerName: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: String, default: () => new Date().toISOString() },
  },
  { _id: false }
);

const factionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, unique: true, index: true },
    tag: { type: String, required: true, unique: true, index: true },
    leaderId: { type: String, required: true, index: true },

    level: { type: Number, default: 1 },
    exp: { type: Number, default: 0 },
    expToNext: { type: Number, default: 100 },

    description: { type: String, default: '' },
    isPrivate: { type: Boolean, default: false },
    minimumPower: { type: Number, default: 0 },
    minimumBarracoLevel: { type: Number, default: 1 },
    allowMemberInvites: { type: Boolean, default: false },
    allowJoinRequests: { type: Boolean, default: true },
    autoAcceptRequests: { type: Boolean, default: false },

    treasury: {
      dirtyMoney: { type: Number, default: 0 },
      cleanMoney: { type: Number, default: 0 },
      corre: { type: Number, default: 0 },
    },

    members: {
      type: [factionMemberSchema],
      default: [],
    },

    joinRequests: {
      type: [factionJoinRequestSchema],
      default: [],
    },

    invites: {
      type: [factionInviteSchema],
      default: [],
    },

    activeBuffs: {
      type: [factionBuffSchema],
      default: [],
    },

    enemyFactionIds: {
      type: [String],
      default: [],
    },

    allyFactionIds: {
      type: [String],
      default: [],
    },

    investments: {
      arsenalColetivo: { type: Number, default: 0 },
      caixaOperacional: { type: Number, default: 0 },
      mobilidade: { type: Number, default: 0 },
      influencia: { type: Number, default: 0 },
      inteligencia: { type: Number, default: 0 },
      fortificacao: { type: Number, default: 0 },
      logistica: { type: Number, default: 0 },
      doutrina: { type: Number, default: 0 },
    },

    investmentBuffs: {
      attackPercent: { type: Number, default: 0 },
      defensePercent: { type: Number, default: 0 },
      hpPercent: { type: Number, default: 0 },
      dirtyMoneyGainPercent: { type: Number, default: 0 },
      cleanMoneyGainPercent: { type: Number, default: 0 },
      agilityPercent: { type: Number, default: 0 },
      intelligencePercent: { type: Number, default: 0 },
      respectPercent: { type: Number, default: 0 },
      baseDefensePercent: { type: Number, default: 0 },
      donationEfficiencyPercent: { type: Number, default: 0 },
      buffDurationPercent: { type: Number, default: 0 },
    },

    investmentLog: {
      type: [factionInvestmentLogSchema],
      default: [],
    },

    totalInvestmentLevel: { type: Number, default: 0 },
    investmentTierName: { type: String, default: 'Turma de Esquina' },

    activityLog: {
      type: [factionActivityLogSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export default mongoose.models.Faction || mongoose.model('Faction', factionSchema);