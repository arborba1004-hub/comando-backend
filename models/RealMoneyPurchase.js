import mongoose from 'mongoose';

const realMoneyPurchaseSchema = new mongoose.Schema({
  playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true, index: true },

  // Tipo de produto comprado com dinheiro real.
  // Mantém compatibilidade com comboios e permite pacotes de Corre sem criar outro fluxo de pagamento.
  productType: {
    type: String,
    enum: ['convoy', 'corre_package'],
    default: 'convoy',
    index: true,
  },

  // Comboio legado/premium. Não é obrigatório para pacote de Corre.
  convoySkinId: { type: String, default: '', index: true },

  // Pacotes consumíveis, ex: 10 Corres por R$ 0,99.
  packageId: { type: String, default: '', index: true },
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
realMoneyPurchaseSchema.index({ playerId: 1, productType: 1, packageId: 1, status: 1 });

export default mongoose.model('RealMoneyPurchase', realMoneyPurchaseSchema);
