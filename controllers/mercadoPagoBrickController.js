import crypto from 'crypto';
import { env } from '../config/env.js';
import Player from '../models/Player.js';
import RealMoneyPurchase from '../models/RealMoneyPurchase.js';
import { getConvoySkin } from '../data/convoyCatalog.js';
import { playerOwnsConvoy } from '../utils/convoyInventory.js';
import { grantRealMoneyConvoy } from '../utils/grantRealMoneyConvoy.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { createMercadoPagoPayment } from '../services/mercadopago/createPayment.js';

function isRealMoneyConvoy(convoy) {
  return convoy?.currency === 'realMoney' || convoy?.purchaseType === 'realMoney';
}

function buildBackendUrl(path) {
  const base = String(env.BACKEND_URL || `http://localhost:${env.PORT}`).trim().replace(/\/+$/, '');
  return `${base}${path}`;
}

function normalizePaymentData(input) {
  const data = input && typeof input === 'object' ? input : {};
  const payer = data.payer && typeof data.payer === 'object' ? data.payer : {};
  const identification = payer.identification && typeof payer.identification === 'object' ? payer.identification : {};

  return {
    token: data.token,
    payment_method_id: data.payment_method_id || data.paymentMethodId,
    issuer_id: data.issuer_id || data.issuerId,
    installments: Number(data.installments || 1),
    payer: {
      email: payer.email,
      first_name: payer.first_name || payer.firstName,
      last_name: payer.last_name || payer.lastName,
      identification: {
        type: identification.type,
        number: identification.number,
      },
    },
  };
}

function isApproved(status) {
  return String(status || '').toLowerCase() === 'approved';
}

function publicPlayer(player) {
  return mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player);
}

export async function getMercadoPagoBrickConfig(req, res) {
  if (!env.MP_PUBLIC_KEY) {
    return res.status(500).json({ error: 'MP_PUBLIC_KEY ausente no Render.', reason: 'mp_public_key_missing' });
  }

  return res.json({
    publicKey: env.MP_PUBLIC_KEY,
    env: env.MP_ENV || 'sandbox',
  });
}

export async function createConvoyBrickPayment(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const skinId = String(req.body?.skinId || req.body?.convoySkinId || '').trim();
    const convoy = getConvoySkin(skinId);

    if (!skinId || convoy.id !== skinId) {
      return res.status(404).json({ error: 'Comboio não encontrado', reason: 'convoy_not_found' });
    }

    if (!isRealMoneyConvoy(convoy)) {
      return res.status(400).json({ error: 'Este comboio não é vendido por dinheiro real.', reason: 'not_real_money_convoy' });
    }

    if (playerOwnsConvoy(player, convoy.id)) {
      grantRealMoneyConvoy(player, convoy.id, { equip: true });
      bumpVersion(player);
      await player.save();
      return res.json({
        status: 'paid',
        convoySkinId: convoy.id,
        amount: Number(convoy.price || 0),
        currency: convoy.realCurrency || 'BRL',
        alreadyOwned: true,
        player: publicPlayer(player),
      });
    }

    const amount = Number(Number(convoy.price || 0).toFixed(2));
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido para pagamento.', reason: 'invalid_amount' });
    }

    const form = normalizePaymentData(req.body?.paymentData);
    if (!form.payment_method_id) {
      return res.status(400).json({ error: 'Meio de pagamento ausente.', reason: 'missing_payment_method' });
    }

    if (!form.payer.email) {
      return res.status(400).json({ error: 'E-mail do pagador ausente.', reason: 'missing_payer_email' });
    }

    const purchase = await RealMoneyPurchase.create({
      playerId: player._id,
      convoySkinId: convoy.id,
      amount,
      currency: convoy.realCurrency || 'BRL',
      status: 'pending',
      provider: 'mercadopago',
    });

    const purchaseId = String(purchase._id);
    const idempotencyKey = crypto.randomUUID();

    const payload = {
      transaction_amount: amount,
      token: form.token,
      description: String(convoy.name || 'Comboio Commandia'),
      installments: Number.isFinite(form.installments) && form.installments > 0 ? form.installments : 1,
      payment_method_id: form.payment_method_id,
      issuer_id: form.issuer_id,
      payer: form.payer,
      external_reference: purchaseId,
      metadata: {
        purchase_id: purchaseId,
        player_id: String(player._id),
        convoy_skin_id: convoy.id,
        source: 'commandia_convoy_payment_brick',
      },
      notification_url: buildBackendUrl('/payments/webhooks/mercadopago'),
      statement_descriptor: 'COMMANDIA',
    };

    const payment = await createMercadoPagoPayment(payload, idempotencyKey);

    purchase.mpPaymentId = payment?.id ? String(payment.id) : '';
    purchase.rawPayment = payment;
    purchase.status = isApproved(payment?.status) ? 'paid' : String(payment?.status || 'pending');

    let granted = false;
    if (isApproved(payment?.status)) {
      const savedPlayer = await Player.findById(player._id);
      if (!savedPlayer) {
        purchase.status = 'failed';
        await purchase.save();
        return res.status(404).json({ error: 'Jogador não encontrado', reason: 'player_not_found' });
      }

      grantRealMoneyConvoy(savedPlayer, convoy.id, { equip: true });
      bumpVersion(savedPlayer);
      purchase.grantedAt = new Date();
      await savedPlayer.save();
      granted = true;
      await purchase.save();

      return res.json({
        purchaseId,
        paymentId: payment?.id,
        status: 'approved',
        statusDetail: payment?.status_detail,
        paymentTypeId: payment?.payment_type_id,
        paymentMethodId: payment?.payment_method_id,
        convoySkinId: convoy.id,
        amount,
        currency: purchase.currency,
        granted,
        player: publicPlayer(savedPlayer),
      });
    }

    await purchase.save();

    const transactionData = payment?.point_of_interaction?.transaction_data || {};

    return res.json({
      purchaseId,
      paymentId: payment?.id,
      status: payment?.status || 'pending',
      statusDetail: payment?.status_detail,
      paymentTypeId: payment?.payment_type_id,
      paymentMethodId: payment?.payment_method_id,
      convoySkinId: convoy.id,
      amount,
      currency: purchase.currency,
      qrCode: transactionData.qr_code,
      qrCodeBase64: transactionData.qr_code_base64,
      ticketUrl: transactionData.ticket_url || payment?.transaction_details?.external_resource_url,
      message: 'Pagamento criado e aguardando aprovação.',
    });
  } catch (error) {
    console.error('[MP_BRICK_CONVOY_PAYMENT]', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Erro ao processar pagamento Mercado Pago',
      reason: error.reason || 'mp_brick_payment_error',
      details: error.details,
    });
  }
}
