import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { createConvoyCheckout, getPurchaseStatus } from '../controllers/mercadoPagoCheckoutController.js';
import { handleMercadoPagoWebhook } from '../controllers/mercadoPagoWebhookController.js';

const router = Router();

router.post('/checkout/convoy', authMiddleware, createConvoyCheckout);
router.get('/purchases/:purchaseId', authMiddleware, getPurchaseStatus);
router.post('/webhooks/mercadopago', handleMercadoPagoWebhook);

export default router;
