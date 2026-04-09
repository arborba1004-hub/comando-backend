const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  channel: { type: String, enum: ['complexo','faccao','mail'], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  senderName: { type: String, required: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
  recipientName: String,
  factionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Faction' },
  subject: String,
  body: { type: String, required: true },
  read: { type: Boolean, default: false },
  system: { type: Boolean, default: false },
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);