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
acceptJoinRequest,
  rejectJoinRequest,
} from '../controllers/factionController.js';
import authMiddleware, { authOnly } from '../middlewares/authMiddleware.js';

const router = Router();

router.get('/list', authOnly, listFactions);
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
router.post('/accept-join-request', authMiddleware, acceptJoinRequest);
router.post('/reject-join-request', authMiddleware, rejectJoinRequest);

export default router;