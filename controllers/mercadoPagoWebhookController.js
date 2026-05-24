import crypto from 'crypto';
import RealMoneyPurchase from '../models/RealMoneyPurchase.js';
import Player from '../models/Player.js';
import { getConvoySkin } from '../data/convoyCatalog.js';
import { getCorrePackage } from '../data/correPackageCatalog.js';
import { getMercadoPagoPayment } from '../services/mercadopago/getPayment.js';
import { grantRealMoneyConvoy } from '../utils/grantRealMoneyConvoy.js';
import { bumpVersion } from '../utils/gameHelpers.js';
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

function getPurchaseType(purchase) {
  return String(purchase.productType || (purchase.convoySkinId ? 'convoy' : '') || '').trim();
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

    if (purchase.grantedAt) {
      purchase.status = 'paid';
      await purchase.save();
      return res.json({ ok: true, alreadyGranted: true });
    }

    const player = await Player.findById(purchase.playerId);
    if (!player) {
      purchase.status = 'failed';
      await purchase.save();
      return res.status(404).json({ error: 'player_not_found' });
    }

    const purchaseType = getPurchaseType(purchase);

    if (purchaseType === 'correPackage') {
      const packageItem = getCorrePackage(purchase.productId);
      if (!packageItem || packageItem.id !== purchase.productId) {
        purchase.status = 'failed';
        await purchase.save();
        return res.status(400).json({ error: 'invalid_corre_package' });
      }

      const correAmount = Math.max(1, Math.floor(Number(purchase.correAmount || packageItem.correAmount || 0)));
      player.balances = player.balances || { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
      player.balances.corre = Math.max(0, Number(player.balances.corre || 0)) + correAmount;
      bumpVersion(player);

      purchase.status = 'paid';
      purchase.grantedAt = new Date();

      await player.save();
      await purchase.save();

      return res.json({ ok: true, granted: true, productType: 'correPackage', correAmount });
    }

    const convoy = getConvoySkin(purchase.convoySkinId);
    if (convoy.id !== purchase.convoySkinId) {
      purchase.status = 'failed';
      await purchase.save();
      return res.status(400).json({ error: 'invalid_convoy' });
    }

    grantRealMoneyConvoy(player, purchase.convoySkinId, { equip: true });
    bumpVersion(player);

    purchase.status = 'paid';
    purchase.grantedAt = new Date();

    await player.save();
    await purchase.save();

    return res.json({ ok: true, granted: true, productType: 'convoy' });
  } catch (error) {
    console.error('[MP_WEBHOOK]', error);
    return res.status(500).json({ error: 'webhook_error' });
  }
}
