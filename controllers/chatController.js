const ChatMessage = require('../models/ChatMessage');
const Player = require('../models/Player');

exports.getMessages = async (req, res) => {
  try {
    const { channel } = req.query;
    if (!channel) return res.status(400).json({ error: 'channel required' });

    let filter = { channel };
    if (channel === 'faccao') {
      const player = await Player.findById(req.user.id);
      if (!player.factionId) return res.json([]);
      filter.factionId = player.factionId;
    } else if (channel === 'mail') {
      filter = {
        $or: [
          { senderId: req.user.id, channel: 'mail' },
          { recipientId: req.user.id, channel: 'mail' }
        ]
      };
    }

    const messages = await ChatMessage.find(filter).sort({ createdAt: 1 }).limit(100);
    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { channel, senderId, senderName, recipientId, recipientName, factionId, subject, body } = req.body;
    if (!channel || !senderId || !senderName || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newMsg = new ChatMessage({
      channel,
      senderId,
      senderName,
      recipientId: recipientId || null,
      recipientName: recipientName || null,
      factionId: factionId || null,
      subject: subject || null,
      body,
    });

    await newMsg.save();

    // Emit via Socket.IO (se configurado)
    const io = req.app.get('io');
    if (io) {
      if (channel === 'complexo') io.to('chat_complexo').emit('chat_message', newMsg);
      else if (channel === 'faccao' && factionId) io.to(`chat_faccao_${factionId}`).emit('chat_message', newMsg);
      else if (channel === 'mail' && recipientId) io.to(`chat_mail_${recipientId}`).emit('chat_message', newMsg);
    }

    res.status(201).json(newMsg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};