import Faction from '../models/Faction.js';
import Player from '../models/Player.js';
import { generateId, bumpVersion } from '../utils/gameHelpers.js';

export async function createFaction(req, res) {
  try {
    const { name, tag } = req.body || {};
    const player = req.player;

    if (!name || !tag) {
      return res.status(400).json({ error: 'Nome e tag são obrigatórios' });
    }

    const existingFaction = await Faction.findOne({
      $or: [{ name: String(name).trim() }, { tag: String(tag).trim() }],
    });

    if (existingFaction) {
      return res.status(400).json({ error: 'Já existe uma facção com esse nome ou tag' });
    }

    if (player.factionId) {
      return res.status(400).json({ error: 'Você já pertence a uma facção' });
    }

    const faction = await Faction.create({
      id: generateId(),
      name: String(name).trim(),
      tag: String(tag).trim(),
      leaderId: String(player._id),
      memberIds: [String(player._id)],
    });

    player.factionId = faction.id;
    bumpVersion(player);
    await player.save();

    return res.status(201).json({ faction });
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
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    return res.json({ faction });
  } catch (error) {
    console.error('Erro ao buscar facção:', error);
    return res.status(500).json({ error: 'Erro ao buscar facção' });
  }
}

export async function joinFaction(req, res) {
  try {
    const player = req.player;
    const { factionId } = req.body || {};

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

    if (!faction.memberIds.includes(String(player._id))) {
      faction.memberIds.push(String(player._id));
    }

    player.factionId = faction.id;

    bumpVersion(player);
    await player.save();
    await faction.save();

    return res.json({ faction });
  } catch (error) {
    console.error('Erro ao entrar na facção:', error);
    return res.status(500).json({ error: 'Erro ao entrar na facção' });
  }
}