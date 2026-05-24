import crypto from 'crypto';
import RealMoneyPurchase from '../models/RealMoneyPurchase.js';
import Player from '../models/Player.js';
import { getConvoySkin } from '../data/convoyCatalog.js';
import { getCorrePackage } from '../data/correPackageCatalog.js';
import { getMercadoPagoPayment } from '../services/mercadopago/getPayment.js';
import { grantRealMoneyConvoy } from '../utils/grantRealMoneyConvoy.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { env } from '../config/env.js';

function getPaymentIdFromWebhook(body) {
  return body?.data?.id || body?.id || body?.resource?.split?.('/').pop?.() || null;
}

function verifyMercadoPagoSignature(req) {
  if (!env.MP_WEBHOOK_SECRET) return true;

  const signature = String(req.headers['x-signature'] || '');
  const requestId = String(req.headers['x-request-id'] || '');
  const dataId = String(req.query?.['data.id'] || req.body?.data?.id || '');

  const tsMatch = signature.match(/ts=([^,]+)/);
  const v1Match = signature.match(/v1=([^,]+)/);

  if (!tsMatch || !v1Match) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${tsMatch[1]};`;
  const hmac = crypto.createHmac('sha256', env.MP_WEBHOOK_SECRET);
  hmac.update(manifest);
  const expected = hmac.digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1Match[1]));
}

function paymentApproved(status) {
  return ['approved', 'accredited'].includes(String(status || '').toLowerCase());
}

function ensureBalances(player) {
  if (!player.balances || typeof player.balances !== 'object') {
    player.balances = { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
  }
  player.balances.dirtyMoney = Number(player.balances.dirtyMoney || 0);
  player.balances.cleanMoney = Number(player.balances.cleanMoney || 0);
  player.balances.corre = Number(player.balances.corre || 0);
}

function grantCorrePackage(player, pack) {
  ensureBalances(player);
  player.balances.corre += Math.max(0, Math.floor(Number(pack.correAmount || 0)));
}

function emitPlayerUpdate(player) {
  emitToPlayer(String(player._id), 'playerUpdate', {
    player: mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player),
  });
}

async function markPaidAlreadyGranted(purchase, res) {
  purchase.status = 'paid';
  await purchase.save();
  return res.json({ ok: true, alreadyGranted: true });
}

async function grantCorrePurchase({ purchase, payment, res }) {
  const pack = getCorrePackage(purchase.packageId || payment?.metadata?.package_id);
  if (!pack) {
    purchase.status = 'failed';
    await purchase.save();
    return res.status(400).json({ error: 'invalid_corre_package' });
  }

  if (purchase.grantedAt) return markPaidAlreadyGranted(purchase, res);

  const player = await Player.findById(purchase.playerId);
  if (!player) {
    purchase.status = 'failed';
    await purchase.save();
    return res.status(404).json({ error: 'player_not_found' });
  }

  grantCorrePackage(player, pack);
  bumpVersion(player);

  purchase.productType = 'corre_package';
  purchase.packageId = pack.id;
  purchase.correAmount = Math.max(0, Math.floor(Number(pack.correAmount || 0)));
  purchase.status = 'paid';
  purchase.grantedAt = new Date();

  await player.save();
  await purchase.save();
  emitPlayerUpdate(player);

  return res.json({ ok: true, granted: true, productType: 'corre_package', packageId: pack.id, correAmount: purchase.correAmount });
}

async function grantConvoyPurchase({ purchase, res }) {
  const convoy = getConvoySkin(purchase.convoySkinId);
  if (!purchase.convoySkinId || convoy.id !== purchase.convoySkinId) {
    purchase.status = 'failed';
    await purchase.save();
    return res.status(400).json({ error: 'invalid_convoy' });
  }

  if (purchase.grantedAt) return markPaidAlreadyGranted(purchase, res);

  const player = await Player.findById(purchase.playerId);
  if (!player) {
    purchase.status = 'failed';
    await purchase.save();
    return res.status(404).json({ error: 'player_not_found' });
  }

  grantRealMoneyConvoy(player, purchase.convoySkinId, { equip: true });
  bumpVersion(player);

  purchase.productType = 'convoy';
  purchase.status = 'paid';
  purchase.grantedAt = new Date();

  await player.save();
  await purchase.save();
  emitPlayerUpdate(player);

  return res.json({ ok: true, granted: true, productType: 'convoy', convoySkinId: purchase.convoySkinId });
}

export async function handleMercadoPagoWebhook(req, res) {
  try {
    if (!verifyMercadoPagoSignature(req)) {
      return res.status(401).json({ error: 'invalid_signature' });
    }

    const paymentId = getPaymentIdFromWebhook(req.body);
    if (!paymentId) return res.status(200).json({ ok: true, ignored: 'missing_payment_id' });

    const payment = await getMercadoPagoPayment(paymentId);
    const purchaseId = String(payment?.external_reference || payment?.metadata?.purchase_id || '').trim();

    if (!purchaseId) return res.status(200).json({ ok: true, ignored: 'missing_external_reference' });

    const purchase = await RealMoneyPurchase.findById(purchaseId);
    if (!purchase) return res.status(200).json({ ok: true, ignored: 'purchase_not_found' });

    purchase.mpPaymentId = String(paymentId);
    purchase.rawPayment = payment;
    purchase.rawWebhook = req.body;

    const paidAmount = Number(payment?.transaction_amount || 0);
    const expectedAmount = Number(purchase.amount || 0);
    const sameAmount = Math.abs(paidAmount - expectedAmount) < 0.01;

    if (!paymentApproved(payment?.status)) {
      purchase.status = String(payment?.status || 'pending');
      await purchase.save();
      return res.json({ ok: true, status: purchase.status });
    }

    if (!sameAmount) {
      purchase.status = 'failed';
      await purchase.save();
      return res.status(400).json({ error: 'invalid_amount', expectedAmount, paidAmount });
    }

    const productType = String(purchase.productType || payment?.metadata?.product_type || '').trim();

    if (productType === 'corre_package' || purchase.packageId) {
      return grantCorrePurchase({ purchase, payment, res });
    }

    return grantConvoyPurchase({ purchase, res });
  } catch (error) {
    console.error('[MP_WEBHOOK]', error);
    return res.status(500).json({ error: 'webhook_error' });
  }
}
