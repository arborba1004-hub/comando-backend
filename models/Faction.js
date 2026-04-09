const mongoose = require('mongoose');

const factionMemberSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  name: String,
  power: Number,
  role: { type: String, enum: ['leader','subleader','captain','soldier','member'], default: 'member' },
  joinedAt: Date,
  lastSeenAt: Date,
});

const factionInviteSchema = new mongoose.Schema({
  id: { type: String, required: true },
  factionId: mongoose.Schema.Types.ObjectId,
  factionName: String,
  factionTag: String,
  invitedPlayerId: String,
  invitedPlayerName: String,
  invitedByPlayerId: String,
  invitedByPlayerName: String,
  createdAt: Date,
});

const factionJoinRequestSchema = new mongoose.Schema({
  id: { type: String, required: true },
  playerId: String,
  playerName: String,
  power: Number,
  createdAt: Date,
});

const factionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  tag: { type: String, required: true, unique: true, uppercase: true, maxlength: 5 },
  leaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  description: String,
  minPowerToJoin: { type: Number, default: 0 },
  maxMembers: { type: Number, default: 20 },
  totalPower: { type: Number, default: 0 },
  members: [factionMemberSchema],
  invites: [factionInviteSchema],
  joinRequests: [factionJoinRequestSchema],
}, { timestamps: true });

module.exports = mongoose.model('Faction', factionSchema);