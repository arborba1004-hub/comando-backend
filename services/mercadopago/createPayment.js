import { env } from '../../config/env.js';

const MP_API_BASE = 'https://api.mercadopago.com';

function cleanObject(value) {
  if (!value || typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null || item === '') continue;
    out[key] = cleanObject(item);
  }
  return out;
}

export async function createMercadoPagoPayment(payload, idempotencyKey) {
  if (!env.MP_ACCESS_TOKEN) {
    const error = new Error('MP_ACCESS_TOKEN ausente no Render.');
    error.status = 500;
    error.reason = 'mercadopago_not_configured';
    throw error;
  }

  const response = await fetch(`${MP_API_BASE}/v1/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(cleanObject(payload)),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.message || `Mercado Pago payment failed: ${response.status}`);
    error.status = 502;
    error.reason = 'mp_payment_failed';
    error.details = data;
    throw error;
  }

  return data;
}
