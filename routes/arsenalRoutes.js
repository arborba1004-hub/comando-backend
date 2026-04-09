import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  buyWeapon,
  upgradeWeapon,
} from '../controllers/arsenalController.js';

const router = Router();

router.post('/weapon/buy', authMiddleware, buyWeapon);
router.post('/weapon/upgrade', authMiddleware, upgradeWeapon);

export default router;