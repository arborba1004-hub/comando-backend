import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  accelerateBarracoUpgrade,
  claimBarracoUpgrade,
  getBarracoStatus,
  startBarracoUpgrade,
} from '../controllers/barracoController.js';

const router = Router();

router.get('/upgrade/status', authMiddleware, getBarracoStatus);
router.post('/upgrade', authMiddleware, startBarracoUpgrade);
router.post('/upgrade/claim', authMiddleware, claimBarracoUpgrade);
router.post('/upgrade/accelerate', authMiddleware, accelerateBarracoUpgrade);

export default router;
