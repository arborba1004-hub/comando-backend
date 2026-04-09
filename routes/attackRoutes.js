import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { initiateAttack } from '../controllers/attackController.js';

const router = Router();

router.post('/initiate', authMiddleware, initiateAttack);

export default router;