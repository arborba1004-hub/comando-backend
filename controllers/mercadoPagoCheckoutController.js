import RealMoneyPurchase from '../models/RealMoneyPurchase.js';
import { getConvoySkin } from '../data/convoyCatalog.js';
import { getCorrePackage } from '../data/correPackageCatalog.js';
import { playerOwnsConvoy } from '../utils/convoyInventory.js';
import { grantRealMoneyConvoy } from '../utils/grantRealMoneyConvoy.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import {
  createMercadoPagoConvoyPreference,
  createMercadoPagoCorrePackagePreference,
} from '../services/mercadopago/createPreference.js';

function isRealMoneyConvoy(convoy) {
  return convoy?.currency === 'realMoney' || convoy?.purchaseType === 'realMoney';
}

function checkoutUrlFromPreference(preference) {
  if (String(process.env.MP_ENV || '').toLowerCase() === 'production') {
    return preference?.init_point || preference?.sandbox_init_point || '';
  }
  return preference?.sandbox_init_point || preference?.init_point || '';
}

function publicPlayer(player) {
  return mergePlayerState(typeof player.toObject === 'function' ? player.toObject() : player);
}

export async function createConvoyCheckout(req, res) {
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
        alreadyOwned: true,
        owned: true,
        player: publicPlayer(player),
      });
    }

    const purchase = await RealMoneyPurchase.create({
      playerId: player._id,
      productType: 'convoy',
      productId: convoy.id,
      convoySkinId: convoy.id,
      amount: Number(convoy.price || 0),
      currency: convoy.realCurrency || 'BRL',
      status: 'pending',
      provider: 'mercadopago',
    });

    const preference = await createMercadoPagoConvoyPreference({ purchase, player, convoy });

    purchase.mpPreferenceId = preference?.id;
    purchase.initPoint = preference?.init_point;
    purchase.sandboxInitPoint = preference?.sandbox_init_point;
    purchase.rawPreference = preference;
    await purchase.save();

    const checkoutUrl = checkoutUrlFromPreference(preference);

    if (!checkoutUrl) {
      return res.status(502).json({
        error: 'Mercado Pago não retornou URL de checkout.',
        reason: 'mp_checkout_url_missing',
        preferenceId: preference?.id,
      });
    }

    return res.json({
      purchaseId: String(purchase._id),
      preferenceId: preference?.id,
      checkoutUrl,
      initPoint: preference?.init_point,
      sandboxInitPoint: preference?.sandbox_init_point,
      amount: purchase.amount,
      currency: purchase.currency,
    });
  } catch (error) {
    console.error('[MP_CREATE_CONVOY_CHECKOUT]', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Erro ao criar checkout Mercado Pago',
      reason: error.reason || 'mp_checkout_error',
      details: error.details,
    });
  }
}


export async function createCorreCheckout(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const packageId = String(req.body?.packageId || 'corre_10_brl_099').trim();
    const packageItem = getCorrePackage(packageId);

    if (!packageItem || packageItem.id !== packageId) {
      return res.status(404).json({ error: 'Pacote de Corres não encontrado', reason: 'corre_package_not_found' });
    }

    const amount = Number(Number(packageItem.price || 0).toFixed(2));
    const correAmount = Math.max(1, Math.floor(Number(packageItem.correAmount || 0)));

    if (!Number.isFinite(amount) || amount <= 0 || correAmount <= 0) {
      return res.status(400).json({ error: 'Pacote de Corres inválido.', reason: 'invalid_corre_package' });
    }

    const purchase = await RealMoneyPurchase.create({
      playerId: player._id,
      productType: 'correPackage',
      productId: packageItem.id,
      convoySkinId: '',
      correAmount,
      amount,
      currency: packageItem.currency || 'BRL',
      status: 'pending',
      provider: 'mercadopago',
    });

    const preference = await createMercadoPagoCorrePackagePreference({ purchase, player, packageItem });

    purchase.mpPreferenceId = preference?.id;
    purchase.initPoint = preference?.init_point;
    purchase.sandboxInitPoint = preference?.sandbox_init_point;
    purchase.rawPreference = preference;
    await purchase.save();

    const checkoutUrl = checkoutUrlFromPreference(preference);

    if (!checkoutUrl) {
      return res.status(502).json({
        error: 'Mercado Pago não retornou URL de checkout.',
        reason: 'mp_checkout_url_missing',
        preferenceId: preference?.id,
      });
    }

    return res.json({
      purchaseId: String(purchase._id),
      preferenceId: preference?.id,
      checkoutUrl,
      initPoint: preference?.init_point,
      sandboxInitPoint: preference?.sandbox_init_point,
      productType: 'correPackage',
      productId: packageItem.id,
      correAmount,
      amount: purchase.amount,
      currency: purchase.currency,
    });
  } catch (error) {
    console.error('[MP_CREATE_CORRE_CHECKOUT]', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Erro ao criar checkout Mercado Pago',
      reason: error.reason || 'mp_corre_checkout_error',
      details: error.details,
    });
  }
}

export async function getPurchaseStatus(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const purchaseId = String(req.params?.purchaseId || '').trim();
    const purchase = await RealMoneyPurchase.findOne({ _id: purchaseId, playerId: player._id });

    if (!purchase) {
      return res.status(404).json({ error: 'Compra não encontrada', reason: 'purchase_not_found' });
    }

    const payload = {
      purchaseId: String(purchase._id),
      status: purchase.status,
      productType: purchase.productType || (purchase.convoySkinId ? 'convoy' : ''),
      productId: purchase.productId || purchase.convoySkinId || '',
      convoySkinId: purchase.convoySkinId,
      correAmount: purchase.correAmount || 0,
      amount: purchase.amount,
      currency: purchase.currency,
      grantedAt: purchase.grantedAt,
    };

    if (purchase.grantedAt && purchase.productType === 'correPackage') {
      payload.player = publicPlayer(player);
    }

    return res.json(payload);
  } catch (error) {
    console.error('[MP_PURCHASE_STATUS]', error);
    return res.status(500).json({ error: 'Erro ao consultar compra' });
  }
}
