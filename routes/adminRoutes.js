import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { resetAllData } from '../controllers/adminController.js';

const router = Router();

router.post('/reset-all-players', authMiddleware, resetAllData);

export default router;