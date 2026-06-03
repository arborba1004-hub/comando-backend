import { Router } from 'express';
import { authOnly } from '../middlewares/authMiddleware.js';
import {
  getAllPlayers,
  getMapPlayersSnapshot,
} from '../controllers/playersController.js';

const router = Router();

router.get('/snapshot', authOnly, getMapPlayersSnapshot);
router.get('/', authOnly, getAllPlayers);

export default router;