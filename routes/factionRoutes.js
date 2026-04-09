const express = require('express');
const authMiddleware = require('../middleware/auth');
const factionController = require('../controllers/factionController');

const router = express.Router();
router.get('/my', authMiddleware, factionController.getMyFaction);
router.post('/create', authMiddleware, factionController.createFaction);
router.post('/invite', authMiddleware, factionController.invitePlayer);
router.post('/accept-invite', authMiddleware, factionController.acceptInvite);
// adicione outras rotas

module.exports = router;