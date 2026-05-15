import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  startTraining,
  collectTraining,
  getGangStatus,
  getTrainingPreview,        // ← novo
  persistTrainingState,
} from '../controllers/trainingController.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/status', getGangStatus);
router.get('/preview', getTrainingPreview);   // ← novo
router.post('/start', startTraining);
router.post('/collect', collectTraining);
router.post('/persist', persistTrainingState);

export default router;