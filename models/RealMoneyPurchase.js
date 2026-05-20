import mongoose from 'mongoose';

const realMoneyPurchaseSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Player',
      required: true,
      index: true,
    },
    convoySkinId: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ['mercadopago'],
      default: 'mercadopago',
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled', 'refunded', 'error'],
      default: 'pending',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'BRL',
    },
    mpPreferenceId: {
      type: String,
      index: true,
    },
    mpPaymentId: {
      type: String,
      index: true,
    },
    initPoint: String,
    sandboxInitPoint: String,
    grantedAt: Date,
    rawPreference: Object,
    rawPayment: Object,
    rawWebhook: Object,
    errorMessage: String,
  },
  { timestamps: true }
);

realMoneyPurchaseSchema.index({ mpPaymentId: 1 }, { sparse: true });
realMoneyPurchaseSchema.index({ playerId: 1, convoySkinId: 1, status: 1 });

export default mongoose.model('RealMoneyPurchase', realMoneyPurchaseSchema);
