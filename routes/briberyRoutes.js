import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { bribe, delacao } from '../controllers/briberyController.js';

const router = Router();

router.post('/bribe', authMiddleware, bribe);
router.post('/delacao', authMiddleware, delacao);

export default router;