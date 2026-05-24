import mongoose from 'mongoose';

const realMoneyPurchaseSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, index: true },
  productType: {
    type: String,
    enum: ['convoy', 'correPackage'],
    default: 'convoy',
    index: true,
  },
  productId: { type: String, default: '', index: true },
  convoySkinId: { type: String, default: '', index: true },
  correAmount: { type: Number, default: 0, min: 0 },
  provider: { type: String, default: 'mercadopago', index: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'paid', 'rejected', 'cancelled', 'refunded', 'failed', 'in_process', 'authorized'],
    default: 'pending',
    index: true,
  },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'BRL' },
  mpPreferenceId: { type: String, index: true },
  mpPaymentId: { type: String, index: true },
  initPoint: { type: String, default: '' },
  sandboxInitPoint: { type: String, default: '' },
  grantedAt: { type: Date, default: null },
  rawPreference: { type: Object, default: null },
  rawPayment: { type: Object, default: null },
  rawWebhook: { type: Object, default: null },
}, { timestamps: true });

realMoneyPurchaseSchema.index({ playerId: 1, convoySkinId: 1, status: 1 });
realMoneyPurchaseSchema.index({ playerId: 1, productType: 1, productId: 1, status: 1 });

export default mongoose.model('RealMoneyPurchase', realMoneyPurchaseSchema);
