import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { gameAction } from '../controllers/gameController.js';

const router = Router();

router.post('/action', authMiddleware, gameAction);

export default router;