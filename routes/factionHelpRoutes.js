import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  listFactionHelpRequests,
  createFactionHelpRequest,
  helpFactionRequest,
} from '../controllers/factionHelpController.js';

const router = Router();

router.get('/list', authMiddleware, listFactionHelpRequests);
router.post('/request', authMiddleware, createFactionHelpRequest);
router.post('/help/:requestId', authMiddleware, helpFactionRequest);

export default router;