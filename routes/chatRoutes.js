import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getChatMessages,
  markChatMessageRead,
  sendChatMessage,
} from '../controllers/chatController.js';

const router = Router();

router.get('/messages', authMiddleware, getChatMessages);
router.post('/send', authMiddleware, sendChatMessage);
router.patch('/messages/:id/read', authMiddleware, markChatMessageRead);

export default router;