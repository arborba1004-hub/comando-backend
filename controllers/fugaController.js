import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { upsertGangStatSource } from '../services/gangStatisticsService.js';

const FUGA_MAX_LEVEL = 100;
const FUGA_MIN_PRICE = 103;
const FUGA_MAX_PRICE = 750_000_000;
const FUGA_BASE_BONUS_PERCENT = 1;
const VALID_CURRENCIES = ['cleanMoney'];
const STAT_KEYS = ['rajada', 'blindagem', 'folego', 'quebra'];
const VALID_MEMBER_TYPES = ['capanga', 'frente', 'executor', 'assassino', 'muralha', 'certeiro', 'motorista', 'nitro'];

const VEHICLE_UPGRADES = {
  turbo_reforcado: { name: 'Turbo Reforçado', targetType: 'motorista', targetStat: 'rajada' },
  pneus_alta_performance: { name: 'Pneus de Alta Performance', targetType: 'motorista', targetStat: 'folego' },
  motor_preparado: { name: 'Motor Preparado', targetType: 'nitro', targetStat: 'rajada' },
  blindagem_leve: { name: 'Blindagem Leve', targetType: 'motorista', targetStat: 'blindagem' },
  anti_rastreamento: { name: 'Sistema Anti-Rastreamento', targetType: 'certeiro', targetStat: 'quebra' },
  nitrox: { name: 'Nitrox', targetType: 'nitro', targetStat: 'quebra' },
};

function clampLevel(level) {
  const numeric = Math.floor(Number(level) || 1);
  return Math.min(FUGA_MAX_LEVEL, Math.max(1, numeric));
}

function getFugaVehiclePrice(level) {
  const safeLevel = clampLevel(level);
  if (safeLevel <= 1) return FUGA_MIN_PRICE;
  if (safeLevel >= FUGA_MAX_LEVEL) return FUGA_MAX_PRICE;

  const ratio = Math.pow(FUGA_MAX_PRICE / FUGA_MIN_PRICE, (safeLevel - 1) / (FUGA_MAX_LEVEL - 1));
  return Number((FUGA_MIN_PRICE * ratio).toFixed(2));
}

function getFugaVehicleUpgradePrice(vehicleLevel, upgradeIndex = 0) {
  const vehiclePrice = getFugaVehiclePrice(vehicleLevel);
  const multiplier = 0.045 + Math.max(0, Number(upgradeIndex) || 0) * 0.01;
  return Number(Math.max(99, vehiclePrice * multiplier).toFixed(2));
}

function getFugaBonusPercent(player) {
  return Number(player?.niveis?.playerLevel || 1) >= 51 ? 2 : FUGA_BASE_BONUS_PERCENT;
}

function ensureContainers(player) {
  if (!player.balances) player.balances = { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
  if (!player.inventory) player.inventory = { items: [], gifts: [], rewards: [] };
  if (!Array.isArray(player.inventory.items)) player.inventory.items = [];
  if (!Array.isArray(player.inventory.gifts)) player.inventory.gifts = [];
  if (!Array.isArray(player.inventory.rewards)) player.inventory.rewards = [];
  if (!Array.isArray(player.ownedVehicles)) player.ownedVehicles = [];
  if (!Array.isArray(player.purchasedAccessories)) player.purchasedAccessories = [];
  if (!player.accessories || typeof player.accessories !== 'object') player.accessories = { vehicles: {}, weapons: {} };
  if (!player.accessories.vehicles || typeof player.accessories.vehicles !== 'object') player.accessories.vehicles = {};
  if (!player.accessories.weapons || typeof player.accessories.weapons !== 'object') player.accessories.weapons = {};
  if (!player.skills || typeof player.skills !== 'object') player.skills = { attack: 0, defense: 0, intelligence: 0, agility: 0, respect: 0, vigor: 0 };
  if (!player.pageLevels || typeof player.pageLevels !== 'object') player.pageLevels = {};
  if (!player.niveis || typeof player.niveis !== 'object') player.niveis = {};
}

function isPurchaseBlocked(player) {
  const punishments = player?.punishments || {};
  return Boolean(
    punishments.inventoryBlocked === true ||
    punishments.cleanMoneyBlocked === true ||
    punishments?.delacao?.active === true
  );
}

function normalizeSkill(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const map = {
    attack: 'attack', ataque: 'attack', rajada: 'attack',
    defense: 'defense', defesa: 'defense', blindagem: 'defense',
    agility: 'agility', agilidade: 'agility', mobilidade: 'agility',
    intelligence: 'intelligence', inteligencia: 'intelligence', inteligência: 'intelligence',
    respect: 'respect', respeito: 'respect',
    vigor: 'vigor', folego: 'vigor', fôlego: 'vigor',
  };
  return map[normalized] || 'agility';
}

function getGangBonusTargetFromSkill(skill) {
  const normalized = normalizeSkill(skill);
  const map = {
    attack: { targetType: 'nitro', targetStat: 'rajada', label: 'Rajada em Nitro' },
    defense: { targetType: 'motorista', targetStat: 'blindagem', label: 'Blindagem em Motorista' },
    agility: { targetType: 'motorista', targetStat: 'folego', label: 'Fôlego em Motorista' },
    intelligence: { targetType: 'certeiro', targetStat: 'quebra', label: 'Quebra em Certeiro' },
    respect: { targetType: 'capanga', targetStat: 'blindagem', label: 'Blindagem em Capanga' },
    vigor: { targetType: 'nitro', targetStat: 'folego', label: 'Fôlego em Nitro' },
  };
  return map[normalized];
}

function buildPercentPayload(targetStat, bonusPercent) {
  return STAT_KEYS.reduce((acc, stat) => {
    acc[stat] = stat === targetStat ? bonusPercent : 0;
    return acc;
  }, {});
}

function sanitizeString(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function hasVehicle(player, vehicleId) {
  const safeId = String(vehicleId || '');
  return player.ownedVehicles.map(String).includes(safeId) || player.inventory.items.some((item) => (
    String(item?.id || '') === safeId ||
    String(item?.vehicleId || '') === safeId
  ));
}

function setFugaProgress(player, level) {
  const safeLevel = clampLevel(level);
  player.pageLevels.fuga = Math.max(Number(player.pageLevels.fuga || 1), safeLevel);
  if (typeof player.markModified === 'function') player.markModified('pageLevels');
}

function applyLegacySkillBonus(player, skillType, bonusPercent) {
  const normalized = normalizeSkill(skillType);
  player.skills[normalized] = Number((Number(player.skills?.[normalized] || 0) + Number(bonusPercent || 0)).toFixed(2));
  if (typeof player.markModified === 'function') player.markModified('skills');
  return normalized;
}

function applyFugaGangSource(player, { id, label, targetType, targetStat, bonusPercent }) {
  const safeTargetType = VALID_MEMBER_TYPES.includes(String(targetType)) ? String(targetType) : 'motorista';
  const safeTargetStat = STAT_KEYS.includes(String(targetStat)) ? String(targetStat) : 'folego';

  return upsertGangStatSource(player, {
    id,
    source: 'item',
    label,
    targetScope: 'type',
    targetType: safeTargetType,
    targetMemberId: null,
    percent: buildPercentPayload(safeTargetStat, Number(bonusPercent || FUGA_BASE_BONUS_PERCENT)),
    flat: { rajada: 0, blindagem: 0, folego: 0, quebra: 0 },
    enabled: true,
    expiresAt: null,
  });
}

function sendPlayerUpdate(player, res, payload = {}) {
  const merged = mergePlayerState(player.toObject());
  emitToPlayer(String(player._id), 'playerUpdate', { player: merged });
  return res.json({ ok: true, player: merged, ...payload });
}

export async function buyFugaVehicle(req, res) {
  try {
    const player = req.player;
    ensureContainers(player);

    if (isPurchaseBlocked(player)) {
      return res.status(423).json({ error: 'Compra bloqueada por punição ativa' });
    }

    const {
      vehicleId,
      name,
      level = 1,
      image = '',
      description = '',
      abilityBonusType = 'agility',
      currency = 'cleanMoney',
    } = req.body || {};

    if (!vehicleId || !name) {
      return res.status(400).json({ error: 'Dados do veículo de fuga incompletos' });
    }

    if (!VALID_CURRENCIES.includes(String(currency))) {
      return res.status(400).json({ error: 'Moeda inválida para veículo de fuga' });
    }

    const safeLevel = clampLevel(level);
    const barracoLevel = clampLevel(player?.niveis?.barracoLevel || 1);

    if (safeLevel > barracoLevel) {
      return res.status(403).json({ error: `Veículo bloqueado. Evolua o barraco para o nível ${safeLevel}.` });
    }

    if (hasVehicle(player, vehicleId)) {
      return res.status(409).json({ error: 'Veículo já comprado' });
    }

    const price = getFugaVehiclePrice(safeLevel);
    const cleanMoney = Number(player?.balances?.cleanMoney || 0);

    if (cleanMoney < price) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const purchasedAt = new Date().toISOString();
    const bonusPercent = getFugaBonusPercent(player);
    const target = getGangBonusTargetFromSkill(abilityBonusType);
    const skillType = applyLegacySkillBonus(player, abilityBonusType, bonusPercent);
    const safeVehicleId = String(vehicleId);

    player.balances.cleanMoney = Number((cleanMoney - price).toFixed(2));
    player.ownedVehicles.push(safeVehicleId);

    const item = {
      id: safeVehicleId,
      vehicleId: safeVehicleId,
      name: sanitizeString(name, `Veículo Nv. ${safeLevel}`),
      category: 'fuga_vehicle',
      source: 'fuga',
      level: safeLevel,
      price,
      finalPrice: price,
      image: sanitizeString(image),
      description: sanitizeString(description),
      abilityBonusType: skillType,
      bonusSkill: skillType,
      bonusValue: bonusPercent,
      targetType: target.targetType,
      targetStat: target.targetStat,
      purchasedAt,
      createdAt: purchasedAt,
    };

    player.inventory.items.push(item);

    const { source: statSource } = applyFugaGangSource(player, {
      id: `fuga:vehicle:${safeVehicleId}`,
      label: `Fuga ${item.name} Nv. ${safeLevel}`,
      targetType: target.targetType,
      targetStat: target.targetStat,
      bonusPercent,
    });

    setFugaProgress(player, safeLevel);
    bumpVersion(player);
    await player.save();

    return sendPlayerUpdate(player, res, {
      item,
      statSource,
      message: `${item.name} comprado com sucesso`,
    });
  } catch (error) {
    console.error('Erro ao comprar veículo de fuga:', error);
    return res.status(500).json({ error: 'Erro ao comprar veículo de fuga' });
  }
}

export async function buyFugaCatalogAccessory(req, res) {
  try {
    const player = req.player;
    ensureContainers(player);

    if (isPurchaseBlocked(player)) {
      return res.status(423).json({ error: 'Compra bloqueada por punição ativa' });
    }

    const {
      accessoryId,
      itemName,
      itemDescription = '',
      itemPrice,
      itemImage = '',
      skillType = 'agility',
    } = req.body || {};

    if (!accessoryId || !itemName) {
      return res.status(400).json({ error: 'Dados do acessório de fuga incompletos' });
    }

    if (player.purchasedAccessories.some((item) => String(item?.accessoryId) === String(accessoryId))) {
      return res.status(409).json({ error: 'Acessório já comprado' });
    }

    const price = Number(itemPrice || 0);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Preço inválido' });
    }

    const cleanMoney = Number(player?.balances?.cleanMoney || 0);
    if (cleanMoney < price) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const purchasedAt = new Date().toISOString();
    const bonusPercent = getFugaBonusPercent(player);
    const normalizedSkill = applyLegacySkillBonus(player, skillType, bonusPercent);
    const target = getGangBonusTargetFromSkill(normalizedSkill);

    player.balances.cleanMoney = Number((cleanMoney - price).toFixed(2));
    player.purchasedAccessories.push({
      accessoryId: String(accessoryId),
      skillType: normalizedSkill,
      purchasedAt,
    });

    const accessory = {
      id: `fuga:accessory:${String(accessoryId)}`,
      accessoryId: String(accessoryId),
      name: sanitizeString(itemName, 'Acessório de Fuga'),
      category: 'fuga_accessory',
      source: 'fuga',
      description: sanitizeString(itemDescription),
      image: sanitizeString(itemImage),
      price,
      finalPrice: price,
      bonusSkill: normalizedSkill,
      bonusValue: bonusPercent,
      targetType: target.targetType,
      targetStat: target.targetStat,
      purchasedAt,
      createdAt: purchasedAt,
    };

    player.inventory.items.push(accessory);

    const { source: statSource } = applyFugaGangSource(player, {
      id: `fuga:accessory:${String(accessoryId)}`,
      label: `Acessório de Fuga ${accessory.name}`,
      targetType: target.targetType,
      targetStat: target.targetStat,
      bonusPercent,
    });

    setFugaProgress(player, player?.niveis?.barracoLevel || 1);
    bumpVersion(player);
    await player.save();

    return sendPlayerUpdate(player, res, {
      accessory,
      statSource,
      message: `${accessory.name} comprado com sucesso`,
    });
  } catch (error) {
    console.error('Erro ao comprar acessório de fuga:', error);
    return res.status(500).json({ error: 'Erro ao comprar acessório de fuga' });
  }
}

export async function buyFugaVehicleUpgrade(req, res) {
  try {
    const player = req.player;
    ensureContainers(player);

    if (isPurchaseBlocked(player)) {
      return res.status(423).json({ error: 'Compra bloqueada por punição ativa' });
    }

    const {
      vehicleId,
      vehicleName = 'Veículo de Fuga',
      vehicleLevel = 1,
      upgradeKey,
      upgradeName,
      targetType,
      targetStat,
    } = req.body || {};

    if (!vehicleId || !upgradeKey) {
      return res.status(400).json({ error: 'Dados do upgrade de fuga incompletos' });
    }

    if (!hasVehicle(player, vehicleId)) {
      return res.status(403).json({ error: 'Compre o veículo antes de instalar upgrades' });
    }

    const safeUpgradeKey = String(upgradeKey);
    const upgradeConfig = VEHICLE_UPGRADES[safeUpgradeKey] || null;
    const safeVehicleId = String(vehicleId);
    const currentList = Array.isArray(player.accessories.vehicles[safeVehicleId])
      ? player.accessories.vehicles[safeVehicleId].map(String)
      : [];

    const finalUpgradeName = sanitizeString(upgradeName || upgradeConfig?.name, safeUpgradeKey);

    if (currentList.includes(finalUpgradeName) || currentList.includes(safeUpgradeKey)) {
      return res.status(409).json({ error: 'Upgrade já instalado nesse veículo' });
    }

    const safeLevel = clampLevel(vehicleLevel);
    const upgradeIndex = Math.max(0, Object.keys(VEHICLE_UPGRADES).indexOf(safeUpgradeKey));
    const price = getFugaVehicleUpgradePrice(safeLevel, upgradeIndex);
    const cleanMoney = Number(player?.balances?.cleanMoney || 0);

    if (cleanMoney < price) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    const bonusPercent = getFugaBonusPercent(player);
    const finalTargetType = VALID_MEMBER_TYPES.includes(String(targetType))
      ? String(targetType)
      : (upgradeConfig?.targetType || 'motorista');
    const finalTargetStat = STAT_KEYS.includes(String(targetStat))
      ? String(targetStat)
      : (upgradeConfig?.targetStat || 'folego');
    const purchasedAt = new Date().toISOString();

    player.balances.cleanMoney = Number((cleanMoney - price).toFixed(2));
    player.accessories.vehicles[safeVehicleId] = [...currentList, finalUpgradeName];
    if (typeof player.markModified === 'function') player.markModified('accessories');

    const upgrade = {
      id: `fuga:vehicle-upgrade:${safeVehicleId}:${safeUpgradeKey}`,
      vehicleId: safeVehicleId,
      vehicleName: sanitizeString(vehicleName, 'Veículo de Fuga'),
      upgradeKey: safeUpgradeKey,
      name: finalUpgradeName,
      category: 'fuga_vehicle_upgrade',
      source: 'fuga',
      level: safeLevel,
      price,
      finalPrice: price,
      bonusValue: bonusPercent,
      targetType: finalTargetType,
      targetStat: finalTargetStat,
      purchasedAt,
      createdAt: purchasedAt,
    };

    player.inventory.items.push(upgrade);

    const { source: statSource } = applyFugaGangSource(player, {
      id: upgrade.id,
      label: `${finalUpgradeName} em ${upgrade.vehicleName}`,
      targetType: finalTargetType,
      targetStat: finalTargetStat,
      bonusPercent,
    });

    setFugaProgress(player, safeLevel);
    bumpVersion(player);
    await player.save();

    return sendPlayerUpdate(player, res, {
      upgrade,
      statSource,
      message: `${finalUpgradeName} instalado com sucesso`,
    });
  } catch (error) {
    console.error('Erro ao comprar upgrade de veículo de fuga:', error);
    return res.status(500).json({ error: 'Erro ao comprar upgrade de veículo de fuga' });
  }
}
