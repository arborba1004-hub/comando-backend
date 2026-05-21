import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getConvoyCatalog,
  getMyConvoys,
  purchaseConvoy,
  equipConvoy,
} from '../controllers/convoyController.js';
import {
  getConvoyAccelerators,
  purchaseConvoyAccelerator,
  useConvoyAccelerator,
} from '../controllers/convoyAcceleratorController.js';

const router = Router();

router.get('/catalog', authMiddleware, getConvoyCatalog);
router.get('/me', authMiddleware, getMyConvoys);
router.post('/purchase', authMiddleware, purchaseConvoy);
router.post('/equip', authMiddleware, equipConvoy);

router.get('/accelerators', authMiddleware, getConvoyAccelerators);
router.post('/accelerators/purchase', authMiddleware, purchaseConvoyAccelerator);
router.post('/accelerators/use', authMiddleware, useConvoyAccelerator);
router.post('/accelerators/use/:battleId', authMiddleware, useConvoyAccelerator);

export default router;
