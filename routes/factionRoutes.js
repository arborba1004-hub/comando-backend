import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  createFaction,
  getMyFaction,
  joinFaction,
} from '../controllers/factionController.js';

const router = Router();

router.post('/create', authMiddleware, createFaction);
router.get('/my', authMiddleware, getMyFaction);
router.post('/join', authMiddleware, joinFaction);

export default router;