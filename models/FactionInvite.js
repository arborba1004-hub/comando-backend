import mongoose from 'mongoose';

const factionInviteSchema = new mongoose.Schema(
  {
    factionId: {
      type: String,
      required: true,
      index: true,
    },
    factionName: {
      type: String,
      default: '',
    },
    factionTag: {
      type: String,
      default: '',
    },

    invitedPlayerId: {
      type: String,
      required: true,
      index: true,
    },
    invitedPlayerName: {
      type: String,
      default: '',
    },

    invitedByPlayerId: {
      type: String,
      required: true,
    },
    invitedByPlayerName: {
      type: String,
      default: '',
    },

    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'expired', 'cancelled'],
      default: 'pending',
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

factionInviteSchema.index(
  { factionId: 1, invitedPlayerId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

const FactionInvite = mongoose.model('FactionInvite', factionInviteSchema);

export default FactionInvite;