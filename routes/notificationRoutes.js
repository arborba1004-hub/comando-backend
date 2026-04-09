import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getNotifications,
  getAttackNotifications,
  markNotificationAsRead,
} from '../controllers/notificationController.js';

const router = Router();

router.get('/', authMiddleware, getNotifications);
router.get('/attacks', authMiddleware, getAttackNotifications);
router.patch('/:id/read', authMiddleware, markNotificationAsRead);

export default router;