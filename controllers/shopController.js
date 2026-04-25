import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion, generateId } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';

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
    const {
      itemId,
      name,
      category = 'luxury',
      price,
      currency = 'cleanMoney',
      rarity = 'standard',
      level = 1,
    } = req.body || {};

    if (!itemId || !name) {
      return res.status(400).json({ error: 'Dados do item de luxo incompletos' });
    }

    const amount = Number(price || 0);
    if (amount < 0) {
      return res.status(400).json({ error: 'Preço inválido' });
    }

    ensureInventory(player);

    if ((player.balances?.[currency] || 0) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    player.balances[currency] -= amount;

    player.inventory.items.push({
      id: String(itemId),
      name: String(name),
      category: String(category),
      rarity: String(rarity),
      level: Number(level || 1),
      purchasedAt: new Date().toISOString(),
      source: 'shop',
    });

    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro ao comprar item de luxo:', error);
    return res.status(500).json({ error: 'Erro ao comprar item de luxo' });
  }
}