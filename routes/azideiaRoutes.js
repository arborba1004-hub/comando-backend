import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  attackX9,
  claimMyAzideiaRewards,
  getMyAzideiaRewards,
  getX9Targets,
} from '../controllers/azideiaController.js';

const router = Router();

router.get('/x9/targets', authMiddleware, getX9Targets);
router.post('/x9/:targetId/attack', authMiddleware, attackX9);
router.get('/rewards/me', authMiddleware, getMyAzideiaRewards);
router.post('/rewards/claim', authMiddleware, claimMyAzideiaRewards);

export default router;
