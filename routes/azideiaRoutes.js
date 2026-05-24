import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  attackX9,
  negotiateCorreria,
  getAzideiaTargets,
  claimMyAzideiaRewards,
  confirmAzideiaMissionArrival,
  confirmAzideiaMissionReturn,
  getActiveAzideiaMissions,
  getMyAzideiaRewards,
  getX9Targets,
} from '../controllers/azideiaController.js';

const router = Router();

router.get('/targets', authMiddleware, getAzideiaTargets);
router.get('/x9/targets', authMiddleware, getX9Targets);
router.post('/x9/:targetId/attack', authMiddleware, attackX9);
router.post('/correria/:targetId/negotiate', authMiddleware, negotiateCorreria);
router.get('/missions/active', authMiddleware, getActiveAzideiaMissions);
router.post('/missions/:missionId/arrive', authMiddleware, confirmAzideiaMissionArrival);
router.post('/missions/:missionId/return', authMiddleware, confirmAzideiaMissionReturn);
router.get('/rewards/me', authMiddleware, getMyAzideiaRewards);
router.post('/rewards/claim', authMiddleware, claimMyAzideiaRewards);

export default router;
