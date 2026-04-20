import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getAllPlayers,
  getMapPlayersSnapshot,
} from '../controllers/playersController.js';

const router = Router();

router.get('/snapshot', authMiddleware, getMapPlayersSnapshot);
router.get('/', authMiddleware, getAllPlayers);

export default router;