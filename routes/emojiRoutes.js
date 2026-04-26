import { Router } from 'express';
import { uploadEmoji } from '../controllers/emojiController.js';
import multer from 'multer';

const router = Router();

const upload = multer({ dest: 'tmp/' });

router.post('/upload', upload.single('file'), uploadEmoji);

export default router;