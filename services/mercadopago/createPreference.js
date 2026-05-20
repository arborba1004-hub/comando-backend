import { env } from '../../config/env.js';

const MP_API_BASE = 'https://api.mercadopago.com';

function normalizeBaseUrl(url, fallback) {
  const value = String(url || fallback || '').trim().replace(/\/+$/, '');
  return value || fallback;
}

function buildFrontendUrl(pathAndQuery) {
  const base = normalizeBaseUrl(env.FRONTEND_URL === '*' ? '' : env.FRONTEND_URL, 'http://localhost:3000');
  return `${base}${pathAndQuery}`;
}

function buildBackendUrl(path) {
  const base = normalizeBaseUrl(env.BACKEND_URL, `http://localhost:${env.PORT}`);
  return `${base}${path}`;
}

export async function createMercadoPagoConvoyPreference({ purchase, player, convoy }) {
  if (!env.MP_ACCESS_TOKEN) {
    const error = new Error('MP_ACCESS_TOKEN ausente no Render.');
    error.status = 500;
    error.reason = 'mercadopago_not_configured';
    throw error;
  }

  const amount = Number(purchase.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Valor inválido para checkout Mercado Pago.');
    error.status = 400;
    error.reason = 'invalid_amount';
    throw error;
  }

  const purchaseId = String(purchase._id);
  const playerId = String(player._id);

  const payload = {
    items: [{
      id: convoy.id,
      title: String(convoy.name || 'Comboio Commandia'),
      description: String(convoy.description || `Comboio ${convoy.id}`),
      quantity: 1,
      unit_price: Number(amount.toFixed(2)),
      currency_id: purchase.currency || 'BRL',
    }],
    external_reference: purchaseId,
    metadata: {
      purchase_id: purchaseId,
      player_id: playerId,
      convoy_skin_id: convoy.id,
      source: 'commandia_convoy_shop',
    },
    notification_url: buildBackendUrl('/payments/webhooks/mercadopago'),
    back_urls: {
      success: buildFrontendUrl(`/shop?tab=comboio&payment=success&purchaseId=${encodeURIComponent(purchaseId)}`),
      failure: buildFrontendUrl(`/shop?tab=comboio&payment=failure&purchaseId=${encodeURIComponent(purchaseId)}`),
      pending: buildFrontendUrl(`/shop?tab=comboio&payment=pending&purchaseId=${encodeURIComponent(purchaseId)}`),
    },
    auto_return: 'approved',
    statement_descriptor: 'COMMANDIA',
  };

  const response = await fetch(`${MP_API_BASE}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`Mercado Pago preference failed: ${response.status}`);
    error.status = 502;
    error.reason = 'mp_preference_failed';
    error.details = data;
    throw error;
  }

  return data;
}
