import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getQgEventState,
  sendQgMarch,
  appointQgRole,
  useQgMandateAbility,
  sendQgMandatePack,
  assignQgServant,
  forceReconcileQgEvent,
  startQgEvent,
  joinQgEvent,
  submitQgEventAction,
  settleQgEvent,
} from '../controllers/qgEventController.js';

const router = Router();

router.get('/state', authMiddleware, getQgEventState);
router.post('/march', authMiddleware, sendQgMarch);
router.post('/appoint-role', authMiddleware, appointQgRole);
router.post('/mandate/ability', authMiddleware, useQgMandateAbility);
router.post('/mandate/pack', authMiddleware, sendQgMandatePack);
router.post('/mandate/servant', authMiddleware, assignQgServant);
router.post('/reconcile', authMiddleware, forceReconcileQgEvent);

// Rotas antigas preservadas para não quebrar front/cache antigo.
router.post('/start', authMiddleware, startQgEvent);
router.post('/join', authMiddleware, joinQgEvent);
router.post('/action', authMiddleware, submitQgEventAction);
router.post('/settle', authMiddleware, settleQgEvent);

export default router;
