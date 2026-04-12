import { Router } from 'express';
import {
  createFaction,
  getMyFaction,
  listFactions,
  joinFaction,
  leaveFaction,
  donate,
  invest,
  updateSettings,
  updateMemberRole,
  kickMember,
  transferLeadership,
} from '../controllers/factionController.js';
import authMiddleware from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/list', authMiddleware, listFactions);
router.get('/my', authMiddleware, getMyFaction);

router.post('/create', authMiddleware, createFaction);
router.post('/join', authMiddleware, joinFaction);
router.post('/leave', authMiddleware, leaveFaction);

router.post('/donate', authMiddleware, donate);
router.post('/invest', authMiddleware, invest);

router.post('/update-settings', authMiddleware, updateSettings);
router.post('/update-member-role', authMiddleware, updateMemberRole);
router.post('/kick', authMiddleware, kickMember);
router.post('/transfer-leadership', authMiddleware, transferLeadership);

export default router;