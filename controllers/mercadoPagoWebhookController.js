import crypto from 'crypto';
import RealMoneyPurchase from '../models/RealMoneyPurchase.js';
import Player from '../models/Player.js';
import { env } from '../config/env.js';
import { getMercadoPagoPayment } from '../services/mercadopago/getPayment.js';
import { grantRealMoneyConvoy } from '../utils/grantRealMoneyConvoy.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';

function parseSignatureHeader(headerValue = '') {
  return String(headerValue || '')
    .split(',')
    .map((part) => part.trim().split('='))
    .reduce((acc, [key, value]) => {
      if (key && value) acc[key] = value;
      return acc;
    }, {});
}

function safeEqualHex(a, b) {
  const aa = Buffer.from(String(a || ''), 'hex');
  const bb = Buffer.from(String(b || ''), 'hex');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function verifyMercadoPagoSignature(req, paymentId) {
  if (!env.MP_WEBHOOK_SECRET) return true;

  const requestId = req.headers['x-request-id'];
  const signature = parseSignatureHeader(req.headers['x-signature']);
  const ts = signature.ts;
  const v1 = signature.v1;

  if (!requestId || !ts || !v1 || !paymentId) return false;

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', env.MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  return safeEqualHex(expected, v1);
}

function extractPaymentId(req) {
  return String(
    req.query?.['data.id'] ||
    req.query?.id ||
    req.body?.data?.id ||
    req.body?.id ||
    req.body?.resource ||
    ''
  ).trim();
}

function isPaymentNotification(req) {
  const type = String(req.query?.type || req.body?.type || req.body?.topic || '').toLowerCase();
  return !type || type === 'payment' || type === 'payments';
}

async function findPurchaseForPayment(payment) {
  const externalReference = String(payment?.external_reference || '').trim();
  const metadataPurchaseId = String(payment?.metadata?.purchase_id || '').trim();
  const preferenceId = String(payment?.preference_id || payment?.order?.id || '').trim();

  if (externalReference) {
    const found = await RealMoneyPurchase.findById(externalReference);
    if (found) return found;
  }

  if (metadataPurchaseId) {
    const found = await RealMoneyPurchase.findById(metadataPurchaseId);
    if (found) return found;
  }

  if (preferenceId) {
    const found = await RealMoneyPurchase.findOne({ mpPreferenceId: preferenceId });
    if (found) return found;
  }

  return null;
}

function emitPlayerUpdate(player) {
  const playerId = String(player?._id || '');
  if (!playerId) return;
  const plain = typeof player.toObject === 'function' ? player.toObject() : player;
  emitToPlayer(playerId, 'playerUpdate', { player: mergePlayerState(plain) });
}

export async function handleMercadoPagoWebhook(req, res) {
  try {
    if (!isPaymentNotification(req)) {
      return res.json({ ok: true, ignored: true, reason: 'not_payment_event' });
    }

    const paymentId = extractPaymentId(req);
    if (!paymentId) {
      return res.status(400).json({ error: 'payment_id_missing' });
    }

    if (!verifyMercadoPagoSignature(req, paymentId)) {
      return res.status(401).json({ error: 'invalid_mercadopago_signature' });
    }

    const payment = await getMercadoPagoPayment(paymentId);
    const purchase = await findPurchaseForPayment(payment);

    if (!purchase) {
      return res.status(404).json({ error: 'purchase_not_found' });
    }

    purchase.rawWebhook = req.body;
    purchase.rawPayment = payment;
    purchase.mpPaymentId = String(payment.id || paymentId);

    const paymentStatus = String(payment.status || '').toLowerCase();

    if (purchase.status === 'approved' && purchase.grantedAt) {
      await purchase.save();
      return res.json({ ok: true, alreadyProcessed: true });
    }

    if (paymentStatus !== 'approved') {
      purchase.status = paymentStatus === 'rejected'
        ? 'rejected'
        : paymentStatus === 'cancelled'
          ? 'cancelled'
          : 'pending';
      await purchase.save();
      return res.json({ ok: true, status: purchase.status, granted: false });
    }

    const paidAmount = Number(payment.transaction_amount || 0);
    if (!Number.isFinite(paidAmount) || paidAmount + 0.0001 < Number(purchase.amount || 0)) {
      purchase.status = 'error';
      purchase.errorMessage = `Valor pago inválido: esperado ${purchase.amount}, recebido ${paidAmount}`;
      await purchase.save();
      return res.status(400).json({ error: 'invalid_paid_amount' });
    }

    const player = await Player.findById(purchase.playerId);
    if (!player) {
      purchase.status = 'error';
      purchase.errorMessage = 'Player não encontrado para liberar comboio.';
      await purchase.save();
      return res.status(404).json({ error: 'player_not_found' });
    }

    grantRealMoneyConvoy(player, purchase.convoySkinId, { equip: true });
    bumpVersion(player);

    purchase.status = 'approved';
    purchase.grantedAt = purchase.grantedAt || new Date();

    await player.save();
    await purchase.save();
    emitPlayerUpdate(player);

    return res.json({ ok: true, status: 'approved', granted: true });
  } catch (error) {
    console.error('[MP_WEBHOOK]', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Erro ao processar webhook Mercado Pago',
      reason: error.reason || 'mp_webhook_error',
      details: error.details,
    });
  }
}
