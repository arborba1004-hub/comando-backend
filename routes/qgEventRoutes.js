import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getQgEventState,
  startQgEvent,
  joinQgEvent,
  submitQgEventAction,
  settleQgEvent,
} from '../controllers/qgEventController.js';

const router = Router();

router.get('/state', authMiddleware, getQgEventState);
router.post('/start', authMiddleware, startQgEvent);
router.post('/join', authMiddleware, joinQgEvent);
router.post('/action', authMiddleware, submitQgEventAction);
router.post('/settle', authMiddleware, settleQgEvent);

export default router;
