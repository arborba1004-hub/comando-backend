import { Router } from 'express';
import { getEmojis, addEmoji } from '../controllers/emojiSystemController.js';

const router = Router();

router.get('/', getEmojis);
router.post('/add', addEmoji); // só você usa (admin/dev)

export default router;