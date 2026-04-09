import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  createGang,
  getMyGang,
  recruitGangMember,
  trainGangMember,
  equipGangMember,
  toggleActiveGangMember,
  dismissGangMember,
  donateToGang,
  upgradeGangSkill,
} from '../controllers/gangController.js';

const router = Router();

router.post('/create', authMiddleware, createGang);
router.get('/my', authMiddleware, getMyGang);
router.post('/recruit', authMiddleware, recruitGangMember);
router.post('/train', authMiddleware, trainGangMember);
router.post('/equip', authMiddleware, equipGangMember);
router.post('/toggle-active', authMiddleware, toggleActiveGangMember);
router.post('/dismiss', authMiddleware, dismissGangMember);
router.post('/donate', authMiddleware, donateToGang);
router.post('/upgrade-skill', authMiddleware, upgradeGangSkill);

export default router;