import Faction from '../models/Faction.js';
import Player from '../models/Player.js';
import { generateId, bumpVersion } from '../utils/gameHelpers.js';

const MAX_FACTION_MEMBERS = 30;

function normalizeText(value, maxLength = 60) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeTag(value) {
  return normalizeText(value, 8).toUpperCase();
}

function normalizeFaction(faction) {
  if (!faction) return null;

  return {
    id: String(faction.id),
    name: String(faction.name),
    tag: String(faction.tag),
    leaderId: String(faction.leaderId),
    memberIds: Array.isArray(faction.memberIds) ? faction.memberIds.map(String) : [],
    treasury: {
      dirtyMoney: Number(faction.treasury?.dirtyMoney || 0),
      cleanMoney: Number(faction.treasury?.cleanMoney || 0),
      corre: Number(faction.treasury?.corre || 0),
    },
    level: Math.max(1, Number(faction.level || 1)),
    exp: Math.max(0, Number(faction.exp || 0)),
    expToNext: Math.max(1, Number(faction.expToNext || 100)),
    createdAtIso: faction.createdAtIso || null,
    createdAt: faction.createdAt || null,
    updatedAt: faction.updatedAt || null,
  };
}

async function clearPlayerFaction(playerId) {
  const player = await Player.findById(playerId);
  if (!player) return null;

  player.factionId = null;
  bumpVersion(player);
  await player.save();
  return player;
}

async function setPlayerFaction(playerId, factionId) {
  const player = await Player.findById(playerId);
  if (!player) return null;

  player.factionId = factionId;
  bumpVersion(player);
  await player.save();
  return player;
}

export async function createFaction(req, res) {
  try {
    const player = req.player;
    const safeName = normalizeText(req.body?.name, 40);
    const safeTag = normalizeTag(req.body?.tag);

    if (!safeName || !safeTag) {
      return res.status(400).json({ error: 'Nome e tag são obrigatórios' });
    }

    if (player.factionId) {
      return res.status(400).json({ error: 'Você já pertence a uma facção' });
    }

    const existingFaction = await Faction.findOne({
      $or: [{ name: safeName }, { tag: safeTag }],
    });

    if (existingFaction) {
      return res.status(400).json({ error: 'Já existe uma facção com esse nome ou tag' });
    }

    const faction = await Faction.create({
      id: generateId(),
      name: safeName,
      tag: safeTag,
      leaderId: String(player._id),
      memberIds: [String(player._id)],
    });

    player.factionId = faction.id;
    bumpVersion(player);
    await player.save();

    return res.status(201).json({
      faction: normalizeFaction(faction),
    });
  } catch (error) {
    console.error('Erro ao criar facção:', error);
    return res.status(500).json({ error: 'Erro ao criar facção' });
  }
}

export async function getMyFaction(req, res) {
  try {
    const player = req.player;

    if (!player.factionId) {
      return res.status(404).json({ error: 'Você não pertence a nenhuma facção' });
    }

    const faction = await Faction.findOne({ id: player.factionId });

    if (!faction) {
      player.factionId = null;
      bumpVersion(player);
      await player.save();

      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    const members = await Player.find(
      { _id: { $in: faction.memberIds } },
      { _id: 1, name: 1, avatar: 1, factionId: 1, power: 1, hierarchyBadge: 1, niveis: 1 }
    ).lean();

    return res.json({
      faction: normalizeFaction(faction),
      members: members.map((member) => ({
        id: String(member._id),
        name: member.name || 'Jogador',
        avatar: member.avatar || '',
        factionId: member.factionId || null,
        power: Number(member.power || 0),
        hierarchyBadge: member.hierarchyBadge || '',
        barracoLevel: Number(member.niveis?.barracoLevel || 1),
        isLeader: String(member._id) === String(faction.leaderId),
      })),
    });
  } catch (error) {
    console.error('Erro ao buscar facção:', error);
    return res.status(500).json({ error: 'Erro ao buscar facção' });
  }
}

export async function listFactions(req, res) {
  try {
    const factions = await Faction.find({})
      .sort({ level: -1, exp: -1, createdAt: 1 })
      .limit(100)
      .lean();

    return res.json({
      factions: factions.map((faction) => ({
        ...normalizeFaction(faction),
        memberCount: Array.isArray(faction.memberIds) ? faction.memberIds.length : 0,
      })),
    });
  } catch (error) {
    console.error('Erro ao listar facções:', error);
    return res.status(500).json({ error: 'Erro ao listar facções' });
  }
}

export async function joinFaction(req, res) {
  try {
    const player = req.player;
    const factionId = normalizeText(req.body?.factionId, 80);

    if (!factionId) {
      return res.status(400).json({ error: 'factionId é obrigatório' });
    }

    if (player.factionId) {
      return res.status(400).json({ error: 'Você já pertence a uma facção' });
    }

    const faction = await Faction.findOne({ id: factionId });

    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    if (faction.memberIds.includes(String(player._id))) {
      player.factionId = faction.id;
      bumpVersion(player);
      await player.save();

      return res.json({
        faction: normalizeFaction(faction),
      });
    }

    if (faction.memberIds.length >= MAX_FACTION_MEMBERS) {
      return res.status(400).json({ error: 'A facção já atingiu o limite de membros' });
    }

    faction.memberIds.push(String(player._id));
    player.factionId = faction.id;

    bumpVersion(player);
    await player.save();
    await faction.save();

    return res.json({
      faction: normalizeFaction(faction),
    });
  } catch (error) {
    console.error('Erro ao entrar na facção:', error);
    return res.status(500).json({ error: 'Erro ao entrar na facção' });
  }
}

export async function leaveFaction(req, res) {
  try {
    const player = req.player;

    if (!player.factionId) {
      return res.status(400).json({ error: 'Você não pertence a nenhuma facção' });
    }

    const faction = await Faction.findOne({ id: player.factionId });

    if (!faction) {
      player.factionId = null;
      bumpVersion(player);
      await player.save();

      return res.json({ success: true, factionDeleted: false });
    }

    const playerId = String(player._id);
    const isLeader = String(faction.leaderId) === playerId;

    faction.memberIds = faction.memberIds.filter((id) => String(id) !== playerId);

    player.factionId = null;
    bumpVersion(player);
    await player.save();

    if (faction.memberIds.length === 0) {
      await Faction.deleteOne({ _id: faction._id });
      return res.json({ success: true, factionDeleted: true });
    }

    if (isLeader) {
      faction.leaderId = String(faction.memberIds[0]);
    }

    await faction.save();

    return res.json({
      success: true,
      factionDeleted: false,
      faction: normalizeFaction(faction),
    });
  } catch (error) {
    console.error('Erro ao sair da facção:', error);
    return res.status(500).json({ error: 'Erro ao sair da facção' });
  }
}

export async function kickMember(req, res) {
  try {
    const player = req.player;
    const memberId = normalizeText(req.body?.memberId, 80);

    if (!player.factionId) {
      return res.status(400).json({ error: 'Você não pertence a nenhuma facção' });
    }

    if (!memberId) {
      return res.status(400).json({ error: 'memberId é obrigatório' });
    }

    const faction = await Faction.findOne({ id: player.factionId });

    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    if (String(faction.leaderId) !== String(player._id)) {
      return res.status(403).json({ error: 'Somente o líder pode expulsar membros' });
    }

    if (String(memberId) === String(player._id)) {
      return res.status(400).json({ error: 'O líder não pode expulsar a si mesmo' });
    }

    if (!faction.memberIds.includes(String(memberId))) {
      return res.status(404).json({ error: 'Membro não encontrado na facção' });
    }

    faction.memberIds = faction.memberIds.filter((id) => String(id) !== String(memberId));
    await faction.save();
    await clearPlayerFaction(memberId);

    return res.json({
      success: true,
      faction: normalizeFaction(faction),
    });
  } catch (error) {
    console.error('Erro ao expulsar membro:', error);
    return res.status(500).json({ error: 'Erro ao expulsar membro' });
  }
}

export async function transferLeadership(req, res) {
  try {
    const player = req.player;
    const newLeaderId = normalizeText(req.body?.memberId, 80);

    if (!player.factionId) {
      return res.status(400).json({ error: 'Você não pertence a nenhuma facção' });
    }

    if (!newLeaderId) {
      return res.status(400).json({ error: 'memberId é obrigatório' });
    }

    const faction = await Faction.findOne({ id: player.factionId });

    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    if (String(faction.leaderId) !== String(player._id)) {
      return res.status(403).json({ error: 'Somente o líder pode transferir a liderança' });
    }

    if (!faction.memberIds.includes(String(newLeaderId))) {
      return res.status(404).json({ error: 'Membro não encontrado na facção' });
    }

    faction.leaderId = String(newLeaderId);
    await faction.save();

    return res.json({
      success: true,
      faction: normalizeFaction(faction),
    });
  } catch (error) {
    console.error('Erro ao transferir liderança:', error);
    return res.status(500).json({ error: 'Erro ao transferir liderança' });
  }
}