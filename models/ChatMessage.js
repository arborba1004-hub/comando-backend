import mongoose from 'mongoose';

const chatMessageSchema = new mongoose.Schema(
  {
    channel: {
      type: String,
      enum: ['complexo', 'faccao', 'mail'],
      required: true,
      index: true,
    },
    senderId: { type: String, required: true, index: true },
    senderName: { type: String, required: true },

    recipientId: { type: String, default: null, index: true },
    recipientName: { type: String, default: null },

    factionId: { type: String, default: null, index: true },

    subject: { type: String, default: null },
    body: { type: String, required: true },

    read: { type: Boolean, default: false },
    system: { type: Boolean, default: false },

    messageType: {
      type: String,
      enum: ['text', 'faction_help_request', 'faction_help_update', 'azideia_reward'],
      default: 'text',
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

chatMessageSchema.index({ channel: 1, createdAt: -1 });
chatMessageSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

const ChatMessage =
  mongoose.models.ChatMessage || mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;