import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  startBattle,
  resolveBattle,
  getBattleReport,
  getBattleHistory,
  initiateAttack,
  estimateBattle,   // ✅ importação adicionada
} from '../controllers/attackController.js';

const router = Router();

// NOVA ROTA DE ESTIMATIVA
router.post('/estimate', authMiddleware, estimateBattle);

// DEMAIS ROTAS
router.post('/start', authMiddleware, startBattle);
router.post('/resolve/:battleId', authMiddleware, resolveBattle);
router.get('/report/:battleId', authMiddleware, getBattleReport);
router.get('/history', authMiddleware, getBattleHistory);

// compatibilidade com rota antiga
router.post('/initiate', authMiddleware, initiateAttack);

export default router;