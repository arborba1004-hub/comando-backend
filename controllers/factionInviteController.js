import mongoose from 'mongoose';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
import FactionInvite from '../models/FactionInvite.js';

function buildFactionLookupByAnyId(factionId) {
  const id = String(factionId || '').trim();
  const query = [{ id }];
  if (mongoose.isValidObjectId(id)) {
    query.push({ _id: id });
  }
  return { $or: query };
}

function getActorMember(faction, playerId) {
  return faction?.members?.find(
    (member) => String(member.playerId) === String(playerId)
  );
}

function canActorInvite(actorMember) {
  if (!actorMember) return false;
  return (
    actorMember.role === 'leader' ||
    actorMember.permissions?.canInvite === true
  );
}

export async function listPlayersWithoutFaction(req, res, next) {
  try {
    const currentPlayerId = String(req.user?.id || req.player?._id || '');

    const players = await Player.find({
      _id: { $ne: currentPlayerId },
      $or: [{ factionId: null }, { factionId: '' }],
    })
      .select('_id name avatar power hierarchyBadge niveis factionId mapPosition')
      .sort({ power: -1, createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({
      ok: true,
      players: players.map((player) => ({
        id: String(player._id),
        name: player.name || 'Jogador',
        avatar: player.avatar || '',
        power: Number(player.power || 0),
        hierarchyBadge: player.hierarchyBadge || '',
        barracoLevel: Number(player?.niveis?.barracoLevel || 1),
        factionId: player.factionId ?? null,
        mapPosition: player.mapPosition || null,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function invitePlayerToFaction(req, res, next) {
  try {
    const actor = req.player;
    const targetPlayerId = String(req.body?.targetPlayerId || '').trim();

    if (!targetPlayerId) {
      return res.status(400).json({ error: 'targetPlayerId é obrigatório' });
    }

    if (!actor?.factionId) {
      return res.status(400).json({ error: 'Você não está em uma facção' });
    }

    const faction = await Faction.findOne(buildFactionLookupByAnyId(actor.factionId));
    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    const actorMember = getActorMember(faction, actor._id);

    if (!canActorInvite(actorMember)) {
      return res.status(403).json({ error: 'Sem permissão para convidar' });
    }

    const targetPlayer = await Player.findById(targetPlayerId);
    if (!targetPlayer) {
      return res.status(404).json({ error: 'Jogador não encontrado' });
    }

    if (String(targetPlayer._id) === String(actor._id)) {
      return res.status(400).json({ error: 'Você não pode convidar a si mesmo' });
    }

    if (targetPlayer.factionId) {
      return res.status(400).json({ error: 'Esse jogador já pertence a uma facção' });
    }

    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    const invite = await FactionInvite.create({
      factionId: String(faction.id || faction._id),
      factionName: faction.name || '',
      factionTag: faction.tag || '',
      invitedPlayerId: String(targetPlayer._id),
      invitedPlayerName: targetPlayer.name || 'Jogador',
      invitedByPlayerId: String(actor._id),
      invitedByPlayerName: actor.name || 'Jogador',
      status: 'pending',
      expiresAt,
    });

    return res.status(201).json({
      ok: true,
      invite: {
        id: String(invite._id),
        factionId: invite.factionId,
        invitedPlayerId: invite.invitedPlayerId,
        status: invite.status,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({
        error: 'Esse jogador já possui um convite pendente dessa facção',
      });
    }

    next(error);
  }
}