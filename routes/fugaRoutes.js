import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import { buyFugaVehicle } from '../controllers/fugaController.js';

const router = Router();

router.post('/buy', authMiddleware, buyFugaVehicle);

export default router;