const mongoose = require('mongoose');

const memberSkillSchema = new mongoose.Schema({
  id: String,
  name: String,
  description: String,
  level: Number,
  maxLevel: Number,
  effect: String,
});

const gangMemberSchema = new mongoose.Schema({
  name: String,
  class: String,
  rarity: String,
  level: Number,
  exp: Number,
  expToNext: Number,
  loyalty: Number,
  skills: [memberSkillSchema],
  equipment: {
    weaponId: String,
    armorId: String,
    vehicleId: String,
  },
  active: Boolean,
  recruitedAt: Date,
  lastMissionAt: Date,
  victories: Number,
  defeats: Number,
});

const gangSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  name: String,
  tag: String,
  level: Number,
  exp: Number,
  expToNext: Number,
  slots: Number,
  treasury: {
    dirtyMoney: Number,
    cleanMoney: Number,
    corre: Number,
  },
  members: [gangMemberSchema],
  activeMemberIds: [String],
  upgrades: {
    trainingGroundsLevel: Number,
    hideoutLevel: Number,
    blackMarketLevel: Number,
  },
  totalVictories: Number,
}, { timestamps: true });

module.exports = mongoose.model('Gang', gangSchema);