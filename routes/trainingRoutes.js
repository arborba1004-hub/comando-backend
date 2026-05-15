import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  startTraining,
  collectTraining,
  getGangStatus,
  persistTrainingState,
} from '../controllers/trainingController.js';

const router = express.Router();

router.use(authMiddleware);

/**
 * GET /api/training/status
 * Retorna gangue, slots de treinamento e saldos atualizados.
 */
router.get('/status', getGangStatus);

/**
 * POST /api/training/start
 * Inicia treinamento authoritative em um CT.
 * Body: { ctKey, troopType }
 */
router.post('/start', startTraining);

/**
 * POST /api/training/collect
 * Coleta um treinamento concluído.
 * Body: { slotId }
 */
router.post('/collect', collectTraining);

/**
 * POST /api/training/persist
 * Compatibilidade com rota antiga: não aceita estado do frontend como verdade.
 */
router.post('/persist', persistTrainingState);

export default router;
