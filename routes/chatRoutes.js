const express = require('express');
const authMiddleware = require('../middleware/auth');
const chatController = require('../controllers/chatController');

const router = express.Router();
router.get('/messages', authMiddleware, chatController.getMessages);
router.post('/send', authMiddleware, chatController.sendMessage);

module.exports = router;