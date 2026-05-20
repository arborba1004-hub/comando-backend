import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { createConvoyCheckout, getPurchaseStatus } from '../controllers/mercadoPagoCheckoutController.js';
import { handleMercadoPagoWebhook } from '../controllers/mercadoPagoWebhookController.js';

const router = Router();

router.post('/checkout/convoy', authMiddleware, createConvoyCheckout);
router.get('/purchases/:purchaseId', authMiddleware, getPurchaseStatus);

// Webhook público chamado pelo Mercado Pago. A segurança vem da assinatura x-signature
// quando MP_WEBHOOK_SECRET estiver configurado no Render.
router.post('/webhooks/mercadopago', handleMercadoPagoWebhook);

export default router;
