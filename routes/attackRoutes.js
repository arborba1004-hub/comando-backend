import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  startBattle,
  resolveBattle,
  getBattleReport,
  getBattleHistory,
  initiateAttack,
  estimateBattle,
  canAttack,
  getActiveBattles,
} from '../controllers/attackController.js';

const router = Router();

router.post('/estimate', authMiddleware, estimateBattle);
router.post('/start', authMiddleware, startBattle);
router.post('/resolve/:battleId', authMiddleware, resolveBattle);
router.get('/report/:battleId', authMiddleware, getBattleReport);
router.get('/history', authMiddleware, getBattleHistory);
router.get('/active', authMiddleware, getActiveBattles);
router.post('/initiate', authMiddleware, initiateAttack);
router.get('/can-attack/:targetId', authMiddleware, canAttack);

export default router;