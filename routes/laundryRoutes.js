import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  canOperateLaundry,
  startLaundry,
  completeLaundry,
} from '../controllers/laundryController.js';

const router = Router();

router.get('/can-operate/:businessId', authMiddleware, canOperateLaundry);
router.post('/start', authMiddleware, startLaundry);
router.post('/complete', authMiddleware, completeLaundry);

export default router;