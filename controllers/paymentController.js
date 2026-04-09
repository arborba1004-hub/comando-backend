import mercadopago from 'mercadopago';
import { env } from '../config/env.js';

if (env.MP_ACCESS_TOKEN) {
  mercadopago.configure({
    access_token: env.MP_ACCESS_TOKEN,
  });
}

export async function createPayment(req, res) {
  try {
    if (!env.MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Mercado Pago não configurado' });
    }

    const {
      title = 'VIP Domínio do Comando',
      description = 'Pagamento do jogo',
      transaction_amount = 10,
      payment_method_id = 'pix',
      email = 'comprador@email.com',
      first_name = 'Jogador',
      last_name = 'Comando',
    } = req.body || {};

    const amount = Number(transaction_amount || 0);

    if (amount <= 0) {
      return res.status(400).json({ error: 'Valor de pagamento inválido' });
    }

    const paymentData = {
      transaction_amount: amount,
      description: String(description),
      payment_method_id: String(payment_method_id),
      payer: {
        email: String(email),
        first_name: String(first_name),
        last_name: String(last_name),
      },
      additional_info: {
        items: [
          {
            title: String(title),
            quantity: 1,
            unit_price: amount,
          },
        ],
      },
    };

    const response = await mercadopago.payment.create(paymentData);

    return res.json({
      payment: response.body,
      publicKey: env.MP_PUBLIC_KEY || '',
    });
  } catch (error) {
    console.error('Erro ao criar pagamento:', error);
    return res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
}