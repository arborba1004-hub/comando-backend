import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import {
  listPlayersWithoutFaction,
  invitePlayerToFaction,
} from '../controllers/factionInviteController.js';

const router = express.Router();

router.get('/players-without-faction', authMiddleware, listPlayersWithoutFaction);
router.post('/invite', authMiddleware, invitePlayerToFaction);

export default router;