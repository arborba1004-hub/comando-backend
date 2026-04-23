import express from 'express';
import authMiddleware  from '../middlewares/authMiddleware.js';
import {
  persistTrainingState,
  collectTraining,
  getGangStatus,
} from '../controllers/trainingController.js';

const router = express.Router();

// Proteger todas as rotas com autenticação
router.use(authMiddleware);

/**
 * POST /api/training/persist
 * Salvar estado de treinamento e membros do gang
 */
router.post('/persist', persistTrainingState);

/**
 * POST /api/training/collect
 * Coletar membros treinados e adicioná-los ao saldo
 */
router.post('/collect', collectTraining);

/**
 * GET /api/training/status
 * Obter status atual do gang do jogador
 */
router.get('/status', getGangStatus);

export default router;