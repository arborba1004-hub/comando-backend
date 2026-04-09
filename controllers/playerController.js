import { mergePlayerState, sanitizePlayerState } from '../utils/playerMapper.js';
import { applyPassiveIncome, bumpVersion } from '../utils/gameHelpers.js';

const ALLOWED_TOP_LEVEL_FIELDS = [
  'hp',
  'niveis',
  'balances',
  'inventory',
  'pageLevels',
  'skills',
  'power',
  'vip',
  'lastSkillTrainAt',
  'lastAttackAt',
  'hierarchyBadge',
  'barracoPosition',
  'mapPosition',
  'laundryProgress',
  'punishments',
  'skillBoostMultiplier',
  'headerCustomization',
  'ownedVehicles',
  'purchasedAccessories',
  'accessories',
  'notifications',
  'attackHistory',
  'factionId',
  'gangId',
];

function pickAllowedFields(payload) {
  const safe = {};

  for (const field of ALLOWED_TOP_LEVEL_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      safe[field] = payload[field];
    }
  }

  return safe;
}

export async function getMe(req, res) {
  try {
    const player = req.player;

    applyPassiveIncome(player);
    bumpVersion(player);
    await player.save();

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro em /player/me:', error);
    return res.status(500).json({ error: 'Erro ao buscar player' });
  }
}

export async function updateMe(req, res) {
  try {
    const player = req.player;
    const incoming = req.body || {};

    const allowedIncoming = pickAllowedFields(incoming);
    const merged = mergePlayerState({
      ...player.toObject(),
      ...allowedIncoming,
      balances: {
        ...(player.toObject().balances || {}),
        ...(allowedIncoming.balances || {}),
      },
      niveis: {
        ...(player.toObject().niveis || {}),
        ...(allowedIncoming.niveis || {}),
      },
      skills: {
        ...(player.toObject().skills || {}),
        ...(allowedIncoming.skills || {}),
      },
      inventory: {
        ...(player.toObject().inventory || {}),
        ...(allowedIncoming.inventory || {}),
      },
      pageLevels: {
        ...(player.toObject().pageLevels || {}),
        ...(allowedIncoming.pageLevels || {}),
      },
      barracoPosition: {
        ...(player.toObject().barracoPosition || {}),
        ...(allowedIncoming.barracoPosition || {}),
      },
      mapPosition: {
        ...(player.toObject().mapPosition || {}),
        ...(allowedIncoming.mapPosition || {}),
      },
      laundryProgress: {
        ...(player.toObject().laundryProgress || {}),
        ...(allowedIncoming.laundryProgress || {}),
      },
      punishments: {
        ...(player.toObject().punishments || {}),
        ...(allowedIncoming.punishments || {}),
        delacao: {
          ...(player.toObject().punishments?.delacao || {}),
          ...(allowedIncoming.punishments?.delacao || {}),
        },
      },
      headerCustomization: {
        ...(player.toObject().headerCustomization || {}),
        ...(allowedIncoming.headerCustomization || {}),
      },
      accessories: {
        ...(player.toObject().accessories || {}),
        ...(allowedIncoming.accessories || {}),
      },
    });

    const sanitized = sanitizePlayerState(merged);

    Object.assign(player, sanitized);
    bumpVersion(player);
    await player.save();

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro em /player/update:', error);
    return res.status(500).json({ error: 'Erro ao atualizar player' });
  }
}