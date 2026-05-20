import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getConvoyCatalog,
  getMyConvoys,
  purchaseConvoy,
  equipConvoy,
} from '../controllers/convoyController.js';

const router = Router();

router.get('/catalog', authMiddleware, getConvoyCatalog);
router.get('/me', authMiddleware, getMyConvoys);
router.post('/purchase', authMiddleware, purchaseConvoy);
router.post('/equip', authMiddleware, equipConvoy);

export default router;
