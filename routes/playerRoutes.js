import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { getMe, updateMe } from '../controllers/playerController.js';

const router = Router();

router.get('/me', authMiddleware, getMe);
router.patch('/update', authMiddleware, updateMe);

export default router;