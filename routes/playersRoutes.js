import { Router } from 'express';
import { getAllPlayers } from '../controllers/playersController.js';

const router = Router();

router.get('/', getAllPlayers);

export default router;