import { env } from '../../config/env.js';

const MP_API_BASE = 'https://api.mercadopago.com';

export async function getMercadoPagoPayment(paymentId) {
  if (!env.MP_ACCESS_TOKEN) {
    const error = new Error('MP_ACCESS_TOKEN ausente no Render.');
    error.status = 500;
    error.reason = 'mercadopago_not_configured';
    throw error;
  }

  const response = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(String(paymentId))}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${env.MP_ACCESS_TOKEN}` },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`Mercado Pago payment fetch failed: ${response.status}`);
    error.status = 502;
    error.reason = 'mp_payment_fetch_failed';
    error.details = data;
    throw error;
  }

  return data;
}
