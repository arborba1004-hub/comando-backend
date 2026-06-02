import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  getQgEventState,
  sendQgMarch,
  withdrawQgGarrison,
  appointQgRole,
  useQgMandateAbility,
  sendQgMandatePack,
  assignQgServant,
  setQgResourceDecree,
  forceReconcileQgEvent,
  startQgEvent,
  joinQgEvent,
  submitQgEventAction,
  settleQgEvent,
} from '../controllers/qgEventController.js';

const router = Router();

router.get('/state', authMiddleware, getQgEventState);
router.post('/march', authMiddleware, sendQgMarch);
router.post('/withdraw', authMiddleware, withdrawQgGarrison);
router.post('/appoint-role', authMiddleware, appointQgRole);
router.post('/mandate/ability', authMiddleware, useQgMandateAbility);
router.post('/mandate/pack', authMiddleware, sendQgMandatePack);
router.post('/mandate/servant', authMiddleware, assignQgServant);
router.post('/mandate/decree', authMiddleware, setQgResourceDecree);
router.post('/reconcile', authMiddleware, forceReconcileQgEvent);

// Rotas antigas preservadas para não quebrar front/cache antigo.
router.post('/start', authMiddleware, startQgEvent);
router.post('/join', authMiddleware, joinQgEvent);
router.post('/action', authMiddleware, submitQgEventAction);
router.post('/settle', authMiddleware, settleQgEvent);

export default router;
