import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { createConvoyCheckout, getPurchaseStatus } from '../controllers/mercadoPagoCheckoutController.js';
import { handleMercadoPagoWebhook } from '../controllers/mercadoPagoWebhookController.js';
import {
  getMercadoPagoBrickConfig,
  createConvoyBrickPayment,
  createCorrePackageBrickPayment,
} from '../controllers/mercadoPagoBrickController.js';

const router = Router();

router.post('/checkout/convoy', authMiddleware, createConvoyCheckout);
router.get('/brick/config', authMiddleware, getMercadoPagoBrickConfig);
router.post('/brick/convoy', authMiddleware, createConvoyBrickPayment);
router.post('/brick/corre-package', authMiddleware, createCorrePackageBrickPayment);
router.get('/purchases/:purchaseId', authMiddleware, getPurchaseStatus);
router.post('/webhooks/mercadopago', handleMercadoPagoWebhook);

export default router;
