const mongoose = require('mongoose');

const attackSchema = new mongoose.Schema({
  attackerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  defenderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  success: Boolean,
  critical: Boolean,
  loot: Number,
  chance: Number,
  attackerPower: Number,
  defenderPower: Number,
  spoils: {
    dirtyMoneyLoot: Number,
    correLoot: Number,
    prestigeLoot: Number,
    brokenLuxuryItemId: String,
    brokenLuxuryItemName: String,
    brokenLuxuryItemValue: Number,
    luxuryConvertedDirtyMoney: Number,
  },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

module.exports = mongoose.model('Attack', attackSchema);