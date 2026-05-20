import { env } from '../../config/env.js';

const MP_API_BASE = 'https://api.mercadopago.com';

export async function getMercadoPagoPayment(paymentId) {
  if (!env.MP_ACCESS_TOKEN) {
    const error = new Error('MP_ACCESS_TOKEN ausente no Render.');
    error.status = 500;
    error.reason = 'mercadopago_not_configured';
    throw error;
  }

  const id = String(paymentId || '').trim();
  if (!id) {
    const error = new Error('paymentId ausente.');
    error.status = 400;
    error.reason = 'missing_payment_id';
    throw error;
  }

  const response = await fetch(`${MP_API_BASE}/v1/payments/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`Mercado Pago get payment failed: ${response.status}`);
    error.status = 502;
    error.reason = 'mp_get_payment_failed';
    error.details = data;
    throw error;
  }

  return data;
}
