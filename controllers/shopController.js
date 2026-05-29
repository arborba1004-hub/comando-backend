import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { upsertGangStatSource } from '../services/gangStatisticsService.js';

const LUXURY_MAX_LEVEL = 100;
const LUXURY_BASE_PRICE = 120;
const LUXURY_PRICE_MULTIPLIER = 1.1;
const LUXURY_BONUS_PERCENT = 1;

const LUXURY_ITEMS = [
  {
    key: 'ring',
    itemId: 1,
    name: 'Anel',
    image: 'https://static.wixstatic.com/media/50f4bf_b4ba3afc05854898ba783d0de389365c~mv2.png',
    targetType: 'frente',
    targetStat: 'rajada',
  },
  {
    key: 'bracelet',
    itemId: 2,
    name: 'Pulseira',
    image: 'https://static.wixstatic.com/media/50f4bf_80f3ea6ada6a4239b5fde6e862c0f4b0~mv2.png',
    targetType: 'muralha',
    targetStat: 'blindagem',
  },
  {
    key: 'watch',
    itemId: 3,
    name: 'Relógio',
    image: 'https://static.wixstatic.com/media/50f4bf_226ad016652549d4a32bf5d065c22547~mv2.png',
    targetType: 'motorista',
    targetStat: 'folego',
  },
  {
    key: 'bag',
    itemId: 4,
    name: 'Bolsa',
    image: 'https://static.wixstatic.com/media/50f4bf_226ad016652549d4a32bf5d065c22547~mv2.png',
    targetType: 'capanga',
    targetStat: 'folego',
  },
  {
    key: 'sunglasses',
    itemId: 5,
    name: 'Óculos de sol',
    image: 'https://static.wixstatic.com/media/50f4bf_f07ae5cb61874c1da022510d81baad88~mv2.png',
    targetType: 'certeiro',
    targetStat: 'rajada',
  },
  {
    key: 'chain',
    itemId: 6,
    name: 'Corrente',
    image: 'https://static.wixstatic.com/media/50f4bf_64a0ccaf2f3f4310a2eb7658c5f48d6d~mv2.png',
    targetType: 'executor',
    targetStat: 'quebra',
  },
];

const LEGACY_ITEM_ID_TO_KEY = {
  1: 'ring',
  2: 'bracelet',
  3: 'chain',
  4: 'bag',
  5: 'watch',
  6: 'sunglasses',
};

const STAT_KEYS = ['rajada', 'blindagem', 'folego', 'quebra'];

function ensureInventory(player) {
  if (!player.inventory) {
    player.inventory = { items: [], gifts: [], rewards: [] };
  }

  if (!Array.isArray(player.inventory.items)) player.inventory.items = [];
  if (!Array.isArray(player.inventory.gifts)) player.inventory.gifts = [];
  if (!Array.isArray(player.inventory.rewards)) player.inventory.rewards = [];
}

function ensureAccessories(player) {
  if (!player.accessories || typeof player.accessories !== 'object') {
    player.accessories = { vehicles: {}, weapons: {} };
  }

  if (!player.accessories.vehicles || typeof player.accessories.vehicles !== 'object') {
    player.accessories.vehicles = {};
  }

  if (!player.accessories.weapons || typeof player.accessories.weapons !== 'object') {
    player.accessories.weapons = {};
  }

  if (!Array.isArray(player.purchasedAccessories)) {
    player.purchasedAccessories = [];
  }

  if (!Array.isArray(player.ownedVehicles)) {
    player.ownedVehicles = [];
  }
}

function clampLevel(level) {
  const numeric = Math.floor(Number(level) || 1);
  return Math.min(LUXURY_MAX_LEVEL, Math.max(1, numeric));
}

function getLuxuryItemPrice(level) {
  const safeLevel = clampLevel(level);
  return Number((LUXURY_BASE_PRICE * Math.pow(LUXURY_PRICE_MULTIPLIER, safeLevel - 1)).toFixed(2));
}

function getLuxuryItemId(itemKey, level) {
  return `luxury:${String(itemKey)}:${clampLevel(level)}`;
}

function getLegacyLuxuryItemId(itemKey, level) {
  return `luxury-${String(itemKey)}-${clampLevel(level)}`;
}

function getLuxuryItemByKey(itemKey) {
  return LUXURY_ITEMS.find((item) => item.key === String(itemKey)) || null;
}

function normalizeLuxuryItemKey(body = {}) {
  if (body.itemKey) return String(body.itemKey);
  if (body.itemType) return String(body.itemType);

  const itemId = Number(body.itemId);
  if (Number.isFinite(itemId) && LEGACY_ITEM_ID_TO_KEY[itemId]) {
    return LEGACY_ITEM_ID_TO_KEY[itemId];
  }

  return '';
}

function hasLuxuryItem(player, itemKey, level) {
  const officialId = getLuxuryItemId(itemKey, level);
  const legacyId = getLegacyLuxuryItemId(itemKey, level);
  const safeLevel = clampLevel(level);

  return (player?.inventory?.items || []).some((item) => (
    item?.id === officialId ||
    item?.id === legacyId ||
    (String(item?.itemKey || '') === String(itemKey) && Number(item?.level) === safeLevel) ||
    (String(item?.itemType || '') === String(itemKey) && Number(item?.level) === safeLevel)
  ));
}

function buildPercentPayload(targetStat) {
  return STAT_KEYS.reduce((acc, stat) => {
    acc[stat] = stat === targetStat ? LUXURY_BONUS_PERCENT : 0;
    return acc;
  }, {});
}

function isLuxuryPurchaseBlocked(player) {
  const punishments = player?.punishments || {};
  return Boolean(
    punishments.inventoryBlocked === true ||
    punishments.cleanMoneyBlocked === true ||
    punishments?.delacao?.active === true
  );
}

function ensureProgressContainers(player) {
  if (!player.balances) player.balances = { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
  if (!player.pageLevels) player.pageLevels = {};
  if (!player.niveis) player.niveis = {};
}

export async function buyAccessory(req, res) {
  try {
    const player = req.player;
    const {
      accessoryId,
      skillType,
      price,
      currency = 'cleanMoney',
      targetType = 'vehicles',
    } = req.body || {};

    if (!accessoryId || !skillType) {
      return res.status(400).json({ error: 'Dados do acessório incompletos' });
    }

    const amount = Number(price || 0);
    if (amount < 0) {
      return res.status(400).json({ error: 'Preço inválido' });
    }

    if (!['cleanMoney', 'dirtyMoney'].includes(currency)) {
      return res.status(400).json({ error: 'Moeda inválida' });
    }

    ensureAccessories(player);

    if ((player.balances?.[currency] || 0) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    player.balances[currency] -= amount;

    if (!player.accessories[targetType] || typeof player.accessories[targetType] !== 'object') {
      player.accessories[targetType] = {};
    }

    player.accessories[targetType][accessoryId] = true;
    player.purchasedAccessories.push({
      accessoryId: String(accessoryId),
      skillType: String(skillType),
      purchasedAt: new Date().toISOString(),
    });

    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro ao comprar acessório:', error);
    return res.status(500).json({ error: 'Erro ao comprar acessório' });
  }
}

export async function buyVehicle(req, res) {
  try {
    const player = req.player;
    const { vehicleId, price, currency = 'cleanMoney' } = req.body || {};

    if (!vehicleId) {
      return res.status(400).json({ error: 'vehicleId é obrigatório' });
    }

    const amount = Number(price || 0);
    if (amount < 0) {
      return res.status(400).json({ error: 'Preço inválido' });
    }

    ensureAccessories(player);

    if ((player.balances?.[currency] || 0) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    player.balances[currency] -= amount;

    if (!player.ownedVehicles.includes(String(vehicleId))) {
      player.ownedVehicles.push(String(vehicleId));
    }

    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro ao comprar veículo:', error);
    return res.status(500).json({ error: 'Erro ao comprar veículo' });
  }
}

export async function buyLuxuryItem(req, res) {
  try {
    const player = req.player;
    ensureInventory(player);
    ensureProgressContainers(player);

    if (isLuxuryPurchaseBlocked(player)) {
      return res.status(423).json({ error: 'Compra bloqueada por punição ativa' });
    }

    const itemKey = normalizeLuxuryItemKey(req.body || {});
    const itemConfig = getLuxuryItemByKey(itemKey);

    if (!itemConfig) {
      return res.status(400).json({ error: 'Item de luxo inválido' });
    }

    const level = clampLevel(req.body?.level ?? player?.niveis?.barracoLevel ?? 1);
    const barracoLevel = clampLevel(player?.niveis?.barracoLevel ?? 1);

    if (level > barracoLevel) {
      return res.status(403).json({
        error: `Coleção nível ${level} bloqueada. Evolua o barraco para liberar.`,
      });
    }

    if (hasLuxuryItem(player, itemConfig.key, level)) {
      return res.status(409).json({ error: 'Item já comprado neste nível' });
    }

    const price = getLuxuryItemPrice(level);
    const cleanMoney = Number(player?.balances?.cleanMoney || 0);

    if (cleanMoney < price) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const purchasedAt = new Date().toISOString();
    const luxuryItemId = getLuxuryItemId(itemConfig.key, level);
    const item = {
      id: luxuryItemId,
      itemId: itemConfig.itemId,
      itemKey: itemConfig.key,
      itemType: itemConfig.key,
      name: itemConfig.name,
      image: itemConfig.image,
      category: 'luxury',
      rarity: 'standard',
      level,
      price,
      finalPrice: price,
      currency: 'cleanMoney',
      insured: false,
      source: 'luxury_showroom',
      bonusPercent: LUXURY_BONUS_PERCENT,
      bonusSkill: itemConfig.targetStat,
      bonusValue: LUXURY_BONUS_PERCENT,
      targetType: itemConfig.targetType,
      targetStat: itemConfig.targetStat,
      collectionName: `Coleção nível ${level}`,
      purchasedAt,
      createdAt: purchasedAt,
      usable: false,
    };

    player.balances.cleanMoney = Number((cleanMoney - price).toFixed(2));
    player.inventory.items.push(item);

    const statSourcePayload = {
      id: `${luxuryItemId}:stat`,
      source: 'item',
      label: `Luxo ${itemConfig.name} Nv. ${level}`,
      targetScope: 'type',
      targetType: itemConfig.targetType,
      targetMemberId: null,
      percent: buildPercentPayload(itemConfig.targetStat),
      flat: { rajada: 0, blindagem: 0, folego: 0, quebra: 0 },
      enabled: true,
      expiresAt: null,
      updatedAtIso: purchasedAt,
    };

    const { source: statSource } = upsertGangStatSource(player, statSourcePayload);

    player.pageLevels.luxury = Math.max(Number(player.pageLevels.luxury || 1), level);
    player.niveis.luxuryLevel = Math.max(Number(player.niveis.luxuryLevel || 1), level);

    if (typeof player.markModified === 'function') {
      player.markModified('inventory');
      player.markModified('balances');
      player.markModified('pageLevels');
      player.markModified('niveis');
    }

    bumpVersion(player);
    await player.save();

    const mappedPlayer = mergePlayerState(player.toObject());
    emitToPlayer(String(player._id), 'playerUpdate', { player: mappedPlayer });

    return res.json({
      message: `${itemConfig.name} comprado com sucesso`,
      player: mappedPlayer,
      item,
      statSource,
    });
  } catch (error) {
    console.error('Erro ao comprar item de luxo:', error);
    return res.status(500).json({ error: 'Erro ao comprar item de luxo' });
  }
}
