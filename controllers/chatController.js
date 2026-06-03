import mongoose from 'mongoose';
import ChatMessage    from '../models/ChatMessage.js';
import Faction from '../models/Faction.js';
import { emitToPlayers, broadcastToAll } from '../services/socketEmitter.js';

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

async function getFactionAliases(factionId) {
  const safe = String(factionId || '').trim();
  if (!safe) return [];
  const query = mongoose.Types.ObjectId.isValid(safe)
    ? { $or: [{ id: safe }, { _id: safe }] }
    : { id: safe };
  const faction = await Faction.findOne(query).select('_id id').lean();
  return uniqueStrings([safe, faction?.id, faction?._id ? String(faction._id) : '']);
}

// Resolve aliases by membership first. This is critical for Azidéia rewards:
// old Player.factionId values may point to Mongo _id or another stale id, while
// the real clan membership is stored in Faction.members.playerId.

async function getFactionMemberIdsByAliases(aliases = []) {
  const safeAliases = uniqueStrings(aliases);
  if (safeAliases.length === 0) return [];

  const objectIdAliases = safeAliases.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const query = {
    $or: [
      { id: { $in: safeAliases } },
      ...(objectIdAliases.length > 0 ? [{ _id: { $in: objectIdAliases } }] : []),
    ],
  };

  const faction = await Faction.findOne(query).select('members.playerId').lean();
  return uniqueStrings((faction?.members || []).map((member) => member?.playerId));
}

async function getFactionAliasesForPlayer(userId, rawFactionId) {
  const safeId = String(rawFactionId || '').trim();
  const playerId = String(userId || '').trim();

  const membershipFaction = playerId
    ? await Faction.findOne({ 'members.playerId': playerId }).select('_id id').lean()
    : null;

  if (membershipFaction) {
    return uniqueStrings([
      membershipFaction.id,
      membershipFaction._id ? String(membershipFaction._id) : '',
      safeId,
    ]);
  }

  if (safeId) {
    const aliases = await getFactionAliases(safeId);
    if (aliases.length > 0) return aliases;
    return [safeId];
  }

  return [];
}

function normalizeMessage(message) {
  return {
    id:            String(message._id),
    channel:       message.channel,
    senderId:      message.senderId,
    senderName:    message.senderName,
    recipientId:   message.recipientId   ?? null,
    recipientName: message.recipientName ?? null,
    factionId:     message.factionId     ?? null,
    subject:       message.subject       ?? null,
    body:          message.body,
    createdAt:     message.createdAt,
    read:          message.read          ?? false,
    system:        message.system        ?? false,
    messageType:   message.messageType   ?? 'text',
    metadata:      message.metadata      ?? {},
  };
}

function sanitizeText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

export async function sendChatMessage(req, res) {
  try {
    const player = req.player;
    const user   = req.user;

    const {
      channel, recipientId, recipientName,
      factionId, subject, body, system, messageType, metadata,
    } = req.body || {};

    if (!channel || !['complexo', 'faccao', 'mail'].includes(String(channel))) {
      return res.status(400).json({ error: 'Canal inválido' });
    }

    const safeBody    = sanitizeText(body, 3000);
    const safeSubject = sanitizeText(subject, 120);

    if (!safeBody) return res.status(400).json({ error: 'Mensagem inválida' });

    const messagePayload = {
      channel:     String(channel),
      senderId:    String(user.id),
      senderName:  player.name,
      recipientId:   null,
      recipientName: null,
      factionId:     null,
      subject:       null,
      body:          safeBody,
      read:          false,
      system:        Boolean(system),
      messageType:   ['text', 'faction_help_request', 'faction_help_update']
                       .includes(String(messageType)) ? String(messageType) : 'text',
      metadata:      metadata && typeof metadata === 'object' ? metadata : {},
    };

    if (channel === 'mail') {
      if (!recipientId || !recipientName) {
        return res.status(400).json({ error: 'Destinatário obrigatório no correio' });
      }
      if (String(recipientId) === String(user.id)) {
        return res.status(400).json({ error: 'Não pode enviar correio para si mesmo' });
      }
      messagePayload.recipientId   = String(recipientId);
      messagePayload.recipientName = sanitizeText(recipientName, 120);
      messagePayload.subject       = safeSubject || null;
    }

    if (channel === 'faccao') {
      // [PATCH] Use the robust alias resolver so players with stale factionId can still send
      const effectiveFactionId = user.factionId || factionId || null;
      if (!effectiveFactionId) {
        return res.status(400).json({ error: 'factionId obrigatório no chat da facção' });
      }
      const factionAliases = await getFactionAliasesForPlayer(user.id, effectiveFactionId);
      messagePayload.factionId = String(factionAliases[0] || effectiveFactionId);
    }

    const message = await ChatMessage.create(messagePayload);
    const normalized = normalizeMessage(message);

    // ── Notificação em tempo real ──────────────────────────────────────────
    // Complexo: todos veem imediatamente.
    // Facção: todos os membros conectados recebem no mesmo instante.
    // Mail: destinatário e remetente recebem para manter abas/dispositivos sincronizados.
    if (channel === 'complexo') {
      broadcastToAll('newChatMessage', normalized);
    } else if (channel === 'faccao') {
      const aliases = await getFactionAliasesForPlayer(user.id, messagePayload.factionId);
      const memberIds = await getFactionMemberIdsByAliases(aliases.length ? aliases : [messagePayload.factionId]);
      emitToPlayers(memberIds, 'newChatMessage', () => normalized);
    } else if (channel === 'mail') {
      emitToPlayers([String(recipientId), String(user.id)], 'newChatMessage', () => normalized);
    }

    return res.status(201).json({ message: normalized });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
}

export async function getChatMessages(req, res) {
  try {
    const { channel } = req.query;
    const userId    = String(req.user.id);
    const factionId = req.user.factionId;

    if (!channel || !['complexo', 'faccao', 'mail'].includes(String(channel))) {
      return res.status(400).json({ error: 'Canal inválido' });
    }

    const filters = { channel: String(channel) };

    if (channel === 'mail') {
      filters.$or = [{ senderId: userId }, { recipientId: userId }];
    }

    if (channel === 'faccao') {
      // [PATCH] Use robust resolver instead of early-return on null factionId.
      // Previously: if (!factionId) return res.json([])
      // This caused players with stale/null factionId (but who ARE faction members)
      // to never receive any faction messages, including Azidéia reward notifications.
      const factionAliases = await getFactionAliasesForPlayer(userId, factionId);
      if (factionAliases.length === 0) return res.json([]);
      filters.factionId = { $in: factionAliases };

      // Importante: leitura de chat precisa ser leve.
      // Reparos de Azidéia ficam nos endpoints próprios de recompensa/coleta,
      // não no polling/leitura do chat da facção.
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
    const { id }   = req.params;
    const userId   = String(req.user.id);
    const message  = await ChatMessage.findById(id);

    if (!message) {
      return res.status(404).json({ error: 'Mensagem não encontrada' });
    }

    if (message.channel !== 'mail') {
      return res.status(400).json({ error: 'Somente mensagens de correio podem ser marcadas como lidas' });
    }

    if (String(message.recipientId) !== userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!message.read) {
      message.read = true;
      await message.save();
    }

    return res.json({ success: true, message: normalizeMessage(message) });
  } catch (error) {
    console.error('Erro ao marcar mensagem como lida:', error);
    return res.status(500).json({ error: 'Erro ao marcar mensagem como lida' });
  }
}
