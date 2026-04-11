import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { getAllPlayers } from '../controllers/playersController.js';

const router = Router();

router.get('/', authMiddleware, getAllPlayers);

export default router; 