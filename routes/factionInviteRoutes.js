import express from 'express';
import authMiddleware, { authOnly } from '../middlewares/authMiddleware.js';
import {
  listPlayersWithoutFaction,
  invitePlayerToFaction,
} from '../controllers/factionInviteController.js';

const router = express.Router();

router.get('/players-without-faction', authOnly, listPlayersWithoutFaction);
router.post('/invite', authMiddleware, invitePlayerToFaction);

export default router;