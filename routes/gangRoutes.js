import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  createOrUpdateGangStatSource,
  deleteGangStatSource,
  getGangStats,
  getMyGang,
  payGangMaintenanceOfficial,
  recruitGangMemberOfficial,
  setGangFormationOfficial,
  upgradeGangCtOfficial,
  applyGangBattleLossesOfficial,
} from '../controllers/gangController.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/me', getMyGang);
router.get('/stats', getGangStats);
router.post('/stats/source', createOrUpdateGangStatSource);
router.delete('/stats/source/:sourceId', deleteGangStatSource);
router.post('/formation/set', setGangFormationOfficial);
router.post('/recruit', recruitGangMemberOfficial);
router.post('/ct/upgrade', upgradeGangCtOfficial);
router.post('/maintenance/pay', payGangMaintenanceOfficial);
router.post('/apply-battle-losses', applyGangBattleLossesOfficial);

export default router;
