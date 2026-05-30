import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  buyFugaCatalogAccessory,
  buyFugaVehicle,
  buyFugaVehicleUpgrade,
} from '../controllers/fugaController.js';

const router = Router();

router.post('/buy', authMiddleware, buyFugaVehicle);
router.post('/accessory/buy', authMiddleware, buyFugaCatalogAccessory);
router.post('/vehicle-upgrade/buy', authMiddleware, buyFugaVehicleUpgrade);

export default router;
