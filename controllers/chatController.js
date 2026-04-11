import ChatMessage from '../models/ChatMessage.js';

function normalizeMessage(message) {
  return {
    id: String(message._id),
    channel: message.channel,
    senderId: message.senderId,
    senderName: message.senderName,
    recipientId: message.recipientId ?? null,
    recipientName: message.recipientName ?? null,
    factionId: message.factionId ?? null,
    subject: message.subject ?? null,
    body: message.body,
    createdAt: message.createdAt,
    read: message.read ?? false,
    system: message.system ?? false,
  };
}

function sanitizeText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

export async function sendChatMessage(req, res) {
  try {
    const player = req.player;
    const user = req.user;

    const {
      channel,
      recipientId,
      recipientName,
      factionId,
      subject,
      body,
      system,
    } = req.body || {};

    if (!channel || !['complexo', 'faccao', 'mail'].includes(String(channel))) {
      return res.status(400).json({ error: 'Canal inválido' });
    }

    const safeBody = sanitizeText(body, 3000);
    const safeSubject = sanitizeText(subject, 120);

    if (!safeBody) {
      return res.status(400).json({ error: 'Mensagem inválida' });
    }

    const messagePayload = {
      channel: String(channel),
      senderId: String(user.id),
      senderName: player.name,
      recipientId: null,
      recipientName: null,
      factionId: null,
      subject: null,
      body: safeBody,
      read: false,
      system: Boolean(system),
    };

    if (channel === 'mail') {
      if (!recipientId || !recipientName) {
        return res.status(400).json({ error: 'Destinatário obrigatório no correio' });
      }

      if (String(recipientId) === String(user.id)) {
        return res.status(400).json({ error: 'Não pode enviar correio para si mesmo' });
      }

      messagePayload.recipientId = String(recipientId);
      messagePayload.recipientName = sanitizeText(recipientName, 120);
      messagePayload.subject = safeSubject || null;
    }

    if (channel === 'faccao') {
      const effectiveFactionId = user.factionId || factionId || null;

      if (!effectiveFactionId) {
        return res.status(400).json({ error: 'factionId obrigatório no chat da facção' });
      }

      messagePayload.factionId = String(effectiveFactionId);
    }

    const message = await ChatMessage.create(messagePayload);

    return res.status(201).json({
      message: normalizeMessage(message),
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
}

export async function getChatMessages(req, res) {
  try {
    const { channel } = req.query;
    const userId = String(req.user.id);
    const factionId = req.user.factionId;

    if (!channel || !['complexo', 'faccao', 'mail'].includes(String(channel))) {
      return res.status(400).json({ error: 'Canal inválido' });
    }

    const filters = { channel: String(channel) };

    if (channel === 'mail') {
      filters.$or = [{ senderId: userId }, { recipientId: userId }];
    }

    if (channel === 'faccao') {
      if (!factionId) {
        return res.json([]);
      }

      filters.factionId = String(factionId);
    }

    const messages = await ChatMessage.find(filters)
      .sort({ createdAt: 1 })
      .limit(300)
      .lean();

    return res.json(messages.map(normalizeMessage));
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    return res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
}

export async function markChatMessageRead(req, res) {
  try {
    const { id } = req.params;
    const userId = String(req.user.id);

    const message = await ChatMessage.findById(id);

    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    if (message.channel !== 'mail') {
      return res.status(400).json({
        error: 'Somente mensagens de correio podem ser marcadas como lidas',
      });
    }

    if (String(message.recipientId) !== userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!message.read) {
      message.read = true;
      await message.save();
    }

    return res.json({
      success: true,
      message: normalizeMessage(message),
    });
  } catch (error) {
    console.error('Erro ao marcar mensagem como lida:', error);
    return res.status(500).json({ error: 'Erro ao marcar mensagem como lida' });
  }
}