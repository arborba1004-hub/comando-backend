import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  buyAccessory,
  buyVehicle,
  buyLuxuryItem,
} from '../controllers/shopController.js';

const router = Router();

router.post('/accessory/buy', authMiddleware, buyAccessory);
router.post('/vehicle/buy', authMiddleware, buyVehicle);
router.post('/luxury/buy', authMiddleware, buyLuxuryItem);

export default router;