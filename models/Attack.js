import mongoose from 'mongoose';

const selectedTroopSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const reportSideSchema = new mongoose.Schema(
  {
    playerId: { type: String, default: '' },
    name: { type: String, default: '' },
    factionTag: { type: String, default: null },
    coordinates: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    barracoLevel: { type: Number, default: 1, min: 1 },
    tropasEliminadas: { type: Number, default: 0, min: 0 },
    perdas: { type: Number, default: 0, min: 0 },
    machucados: { type: Number, default: 0, min: 0 },
    vivos: { type: Number, default: 0, min: 0 },
    danoTotalCausado: { type: Number, default: 0, min: 0 },
    danoTotalRecebido: { type: Number, default: 0, min: 0 },
    composicaoInicial: { type: Object, default: {} },
    composicaoFinal: { type: Object, default: {} },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    winner: {
      type: String,
      enum: ['atacante', 'defensor', 'empate'],
      default: 'empate',
    },
    rounds: { type: Number, default: 0, min: 0 },
    resolution: { type: Object, default: null },
    lootDirtyMoney: { type: Number, default: 0, min: 0 },
    barracoLevelPerdedor: { type: Number, default: 0, min: 0 },
    attacker: { type: reportSideSchema, default: {} },
    defender: { type: reportSideSchema, default: {} },
    attackerSubject: { type: String, default: '' },
    attackerBody: { type: String, default: '' },
    defenderSubject: { type: String, default: '' },
    defenderBody: { type: String, default: '' },
  },
  { _id: false }
);

const attackSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },

    status: {
      type: String,
      enum: ['travelling', 'resolved', 'cancelled'],
      default: 'travelling',
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

    routeDistanceTiles: { type: Number, default: 0, min: 0 },
    timePerTileMs: { type: Number, default: 0, min: 0 },
    totalDurationMs: { type: Number, default: 0, min: 0 },

    launchedAtIso: { type: String, default: () => new Date().toISOString() },
    arriveAtIso: { type: String, default: null },
    resolvedAtIso: { type: String, default: null },

    selectedTroops: { type: [selectedTroopSchema], default: [] },
    selectedMemberIds: { type: [String], default: [] },

    success: { type: Boolean, default: null },
    critical: { type: Boolean, default: null },
    loot: { type: Number, default: 0, min: 0 },

    report: { type: reportSchema, default: {} },

    mailStatus: {
      sentToAttacker: { type: Boolean, default: false },
      sentToDefensor: { type: Boolean, default: false },
      errors: { type: [String], default: [] },
      retriedAt: { type: String, default: null },
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Attack = mongoose.models.Attack || mongoose.model('Attack', attackSchema);

export default Attack;