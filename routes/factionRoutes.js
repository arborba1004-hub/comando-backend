import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  createFaction,
  getMyFaction,
  listFactions,
  joinFaction,
  leaveFaction,
  kickMember,
  transferLeadership,
} from '../controllers/factionController.js';

const router = Router();

router.post('/create', authMiddleware, createFaction);
router.get('/my', authMiddleware, getMyFaction);
router.get('/list', authMiddleware, listFactions);
router.post('/join', authMiddleware, joinFaction);
router.post('/leave', authMiddleware, leaveFaction);
router.post('/kick', authMiddleware, kickMember);
router.post('/transfer-leadership', authMiddleware, transferLeadership);

export default router;