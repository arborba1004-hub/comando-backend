import Player from '../models/Player.js';
import { deepMerge } from '../utils/deepMerge.js';

const ALLOWED_UPDATE_FIELDS = [
  'dirtyMoney',
  'cleanMoney',
  'corre',
  'hp',
  'niveis',
  'skills',
  'inventory',
  'mapPosition',
  'power',
  'hierarchyBadge',
];

const BLOCKED_TOP_LEVEL_FIELDS = [
  '_id',
  'googleId',
  'email',
  'name',
  'avatar',
  'lastLoginAt',
  'lastPassiveIncomeAt',
  'lastSpinAt',
  'createdAt',
  'updatedAt',
];

function pickAllowedFields(payload) {
  const safeData = {};

  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      safeData[field] = payload[field];
    }
  }

  return safeData;
}

function containsBlockedFields(payload) {
  return BLOCKED_TOP_LEVEL_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(payload, field)
  );
}

function sanitizeNumber(value, fallback = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return value;
}

function normalizePlayerUpdate(currentPlayer, incomingData) {
  const merged = deepMerge(currentPlayer.toObject(), incomingData);

  merged.dirtyMoney = Math.max(0, sanitizeNumber(merged.dirtyMoney, currentPlayer.dirtyMoney));
  merged.cleanMoney = Math.max(0, sanitizeNumber(merged.cleanMoney, currentPlayer.cleanMoney));
  merged.corre = Math.max(0, sanitizeNumber(merged.corre, currentPlayer.corre));
  merged.hp = Math.max(0, sanitizeNumber(merged.hp, currentPlayer.hp));
  merged.power = Math.max(0, sanitizeNumber(merged.power, currentPlayer.power));

  if (merged.niveis) {
    for (const key of Object.keys(currentPlayer.niveis.toObject())) {
      merged.niveis[key] = Math.max(
        1,
        sanitizeNumber(merged.niveis[key], currentPlayer.niveis[key])
      );
    }
  }

  if (merged.skills) {
    for (const key of Object.keys(currentPlayer.skills.toObject())) {
      merged.skills[key] = Math.max(
        1,
        sanitizeNumber(merged.skills[key], currentPlayer.skills[key])
      );
    }
  }

  if (merged.inventory) {
    merged.inventory.items = Array.isArray(merged.inventory.items)
      ? merged.inventory.items
      : currentPlayer.inventory.items;

    merged.inventory.gifts = Array.isArray(merged.inventory.gifts)
      ? merged.inventory.gifts
      : currentPlayer.inventory.gifts;

    merged.inventory.rewards = Array.isArray(merged.inventory.rewards)
      ? merged.inventory.rewards
      : currentPlayer.inventory.rewards;
  }

  if (merged.mapPosition) {
    merged.mapPosition.tileX = sanitizeNumber(
      merged.mapPosition.tileX,
      currentPlayer.mapPosition.tileX
    );
    merged.mapPosition.tileY = sanitizeNumber(
      merged.mapPosition.tileY,
      currentPlayer.mapPosition.tileY
    );
    merged.mapPosition.worldX = sanitizeNumber(
      merged.mapPosition.worldX,
      currentPlayer.mapPosition.worldX
    );
    merged.mapPosition.worldY = sanitizeNumber(
      merged.mapPosition.worldY,
      currentPlayer.mapPosition.worldY
    );
  }

  if (typeof merged.hierarchyBadge !== 'string') {
    merged.hierarchyBadge = currentPlayer.hierarchyBadge;
  }

  return merged;
}

export async function getMe(req, res) {
  try {
    return res.status(200).json({
      ok: true,
      player: req.player,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: 'Erro ao buscar jogador',
    });
  }
}

export async function updateMe(req, res) {
  try {
    const payload = req.body || {};

    if (containsBlockedFields(payload)) {
      return res.status(400).json({
        ok: false,
        error: 'Tentativa de alteração de campos protegidos',
      });
    }

    const safeIncomingData = pickAllowedFields(payload);
    const normalizedData = normalizePlayerUpdate(req.player, safeIncomingData);

    const updatedPlayer = await Player.findByIdAndUpdate(
      req.player._id,
      {
        $set: {
          dirtyMoney: normalizedData.dirtyMoney,
          cleanMoney: normalizedData.cleanMoney,
          corre: normalizedData.corre,
          hp: normalizedData.hp,
          niveis: normalizedData.niveis,
          skills: normalizedData.skills,
          inventory: normalizedData.inventory,
          mapPosition: normalizedData.mapPosition,
          power: normalizedData.power,
          hierarchyBadge: normalizedData.hierarchyBadge,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    return res.status(200).json({
      ok: true,
      player: updatedPlayer,
    });
  } catch (error) {
    console.error('Erro em PATCH /player/update:', error);

    return res.status(500).json({
      ok: false,
      error: 'Erro ao atualizar jogador',
    });
  }
}
