import mongoose from 'mongoose';

const factionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, unique: true, index: true },
    tag: { type: String, required: true, unique: true, index: true },
    leaderId: { type: String, required: true, index: true },
    memberIds: { type: [String], default: [] },
    treasury: {
      dirtyMoney: { type: Number, default: 0, min: 0 },
      cleanMoney: { type: Number, default: 0, min: 0 },
      corre: { type: Number, default: 0, min: 0 },
    },
    level: { type: Number, default: 1, min: 1 },
    exp: { type: Number, default: 0, min: 0 },
    expToNext: { type: Number, default: 100, min: 1 },
    createdAtIso: {
      type: String,
      default: () => new Date().toISOString(),
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Faction = mongoose.models.Faction || mongoose.model('Faction', factionSchema);

export default Faction;