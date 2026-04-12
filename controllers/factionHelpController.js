import FactionHelpRequest from '../models/FactionHelpRequest.js';
import Faction from '../models/Faction.js';
import Player from '../models/Player.js';
import ChatMessage from '../models/ChatMessage.js';
import { generateId, bumpVersion } from '../utils/gameHelpers.js';

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeText(value, maxLength = 140) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeHelpRequest(request) {
  return {
    id: String(request.id),
    factionId: String(request.factionId),
    requesterId: String(request.requesterId),
    requesterName: String(request.requesterName || 'Jogador'),
    message: String(request.message || ''),
    helpCount: Number(request.helpCount || 0),
    maxHelps: Number(request.maxHelps || 10),
    helperIds: Array.isArray(request.helperIds) ? request.helperIds.map(String) : [],
    rewardPerHelp: Number(request.rewardPerHelp || 1),
    totalRewardGranted: Number(request.totalRewardGranted || 0),
    status: String(request.status || 'active'),
    requestDate: String(request.requestDate || ''),
    createdAtIso: String(request.createdAtIso || ''),
    completedAtIso: String(request.completedAtIso || ''),
  };
}

async function ensureFactionMember(player) {
  if (!player?.factionId) {
    return { ok: false, error: 'Você não pertence a nenhuma facção' };
  }

  const faction = await Faction.findOne({ id: String(player.factionId) });
  if (!faction) {
    return { ok: false, error: 'Facção não encontrada' };
  }

  const isMember = Array.isArray(faction.members)
    ? faction.members.some((member) => String(member.playerId) === String(player._id))
    : false;

  if (!isMember) {
    return { ok: false, error: 'Você não pertence a essa facção' };
  }

  return { ok: true, faction };
}

export async function listFactionHelpRequests(req, res) {
  try {
    const player = req.player;
    const factionCheck = await ensureFactionMember(player);

    if (!factionCheck.ok) {
      return res.status(403).json({ error: factionCheck.error });
    }

    const requests = await FactionHelpRequest.find({
      factionId: String(player.factionId),
      requestDate: todayString(),
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      requests: requests.map(normalizeHelpRequest),
    });
  } catch (error) {
    console.error('Erro ao listar pedidos de corre:', error);
    return res.status(500).json({ error: 'Erro ao listar pedidos de corre' });
  }
}

export async function createFactionHelpRequest(req, res) {
  try {
    const player = req.player;
    const factionCheck = await ensureFactionMember(player);

    if (!factionCheck.ok) {
      return res.status(403).json({ error: factionCheck.error });
    }

    const requestDate = todayString();

    const existingToday = await FactionHelpRequest.findOne({
      requesterId: String(player._id),
      requestDate,
      status: { $in: ['active', 'completed'] },
    });

    if (existingToday) {
      return res.status(400).json({ error: 'Você já fez um pedido de corre hoje' });
    }

    const message = normalizeText(
      req.body?.message || 'Família, fortalece no corre aí 🙏',
      140
    );

    const request = await FactionHelpRequest.create({
      id: generateId(),
      factionId: String(player.factionId),
      requesterId: String(player._id),
      requesterName: player.name || 'Jogador',
      message,
      helpCount: 0,
      maxHelps: 10,
      helperIds: [],
      rewardPerHelp: 1,
      totalRewardGranted: 0,
      status: 'active',
      requestDate,
      createdAtIso: new Date().toISOString(),
      completedAtIso: '',
    });

    await ChatMessage.create({
      channel: 'faccao',
      senderId: String(player._id),
      senderName: player.name || 'Jogador',
      factionId: String(player.factionId),
      subject: null,
      body: `📢 Pedido de corre: ${message}`,
      read: false,
      system: true,
      messageType: 'faction_help_request',
      metadata: {
        requestId: request.id,
      },
    });

    return res.status(201).json({
      success: true,
      request: normalizeHelpRequest(request),
    });
  } catch (error) {
    console.error('Erro ao criar pedido de corre:', error);
    return res.status(500).json({ error: 'Erro ao criar pedido de corre' });
  }
}

export async function helpFactionRequest(req, res) {
  try {
    const player = req.player;
    const { requestId } = req.params;

    const factionCheck = await ensureFactionMember(player);
    if (!factionCheck.ok) {
      return res.status(403).json({ error: factionCheck.error });
    }

    const request = await FactionHelpRequest.findOne({ id: String(requestId) });
    if (!request) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    if (String(request.factionId) !== String(player.factionId)) {
      return res.status(403).json({ error: 'Pedido não pertence à sua facção' });
    }

    if (request.status !== 'active') {
      return res.status(400).json({ error: 'Esse pedido não está mais ativo' });
    }

    if (String(request.requesterId) === String(player._id)) {
      return res.status(400).json({ error: 'Você não pode ajudar o próprio pedido' });
    }

    if (Array.isArray(request.helperIds) && request.helperIds.includes(String(player._id))) {
      return res.status(400).json({ error: 'Você já ajudou esse pedido' });
    }

    if (Number(request.helpCount || 0) >= Number(request.maxHelps || 10)) {
      request.status = 'completed';
      request.completedAtIso = new Date().toISOString();
      await request.save();
      return res.status(400).json({ error: 'Esse pedido já atingiu o limite de ajudas' });
    }

    const requester = await Player.findById(request.requesterId);
    if (!requester) {
      return res.status(404).json({ error: 'Solicitante não encontrado' });
    }

    const reward = Number(request.rewardPerHelp || 1);

    requester.balances = requester.balances || {};
    requester.balances.corre = Number(requester.balances.corre || 0) + reward;

    bumpVersion(requester);
    await requester.save();

    request.helperIds.push(String(player._id));
    request.helpCount = Number(request.helpCount || 0) + 1;
    request.totalRewardGranted = Number(request.totalRewardGranted || 0) + reward;

    if (request.helpCount >= request.maxHelps) {
      request.status = 'completed';
      request.completedAtIso = new Date().toISOString();
    }

    await request.save();

    await ChatMessage.create({
      channel: 'faccao',
      senderId: String(player._id),
      senderName: player.name || 'Jogador',
      factionId: String(player.factionId),
      subject: null,
      body: `🤝 ajudou ${request.requesterName} no pedido de corre`,
      read: false,
      system: true,
      messageType: 'faction_help_update',
      metadata: {
        requestId: request.id,
        helperId: String(player._id),
        helperName: player.name || 'Jogador',
        helpCount: request.helpCount,
        maxHelps: request.maxHelps,
      },
    });

    return res.json({
      success: true,
      request: normalizeHelpRequest(request),
      rewardGranted: reward,
    });
  } catch (error) {
    console.error('Erro ao ajudar pedido de corre:', error);
    return res.status(500).json({ error: 'Erro ao ajudar pedido de corre' });
  }
}