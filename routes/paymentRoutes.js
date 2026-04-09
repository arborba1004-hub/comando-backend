import { Router } from 'express';
import { createPayment } from '../controllers/paymentController.js';

const router = Router();

router.post('/create-payment', createPayment);

export default router;