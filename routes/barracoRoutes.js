import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { upgradeBarraco } from '../controllers/barracoController.js';

const router = Router();

router.post('/upgrade', authMiddleware, upgradeBarraco);

export default router;
