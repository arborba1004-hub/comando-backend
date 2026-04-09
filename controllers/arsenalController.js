import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion, generateId } from '../utils/gameHelpers.js';

function ensureInventory(player) {
  if (!player.inventory) {
    player.inventory = { items: [], gifts: [], rewards: [] };
  }

  if (!Array.isArray(player.inventory.items)) {
    player.inventory.items = [];
  }
}

export async function buyWeapon(req, res) {
  try {
    const player = req.player;
    const {
      weaponId,
      name,
      damage = 0,
      rarity = 'common',
      price,
      currency = 'dirtyMoney',
    } = req.body || {};

    if (!weaponId || !name) {
      return res.status(400).json({ error: 'Dados da arma incompletos' });
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

    const existing = player.inventory.items.find((item) => item?.id === weaponId);

    if (!existing) {
      player.inventory.items.push({
        id: String(weaponId),
        name: String(name),
        category: 'weapon',
        rarity: String(rarity),
        damage: Number(damage || 0),
        level: 1,
        purchasedAt: new Date().toISOString(),
        source: 'arsenal',
      });
    }

    bumpVersion(player);
    await player.save();

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro ao comprar arma:', error);
    return res.status(500).json({ error: 'Erro ao comprar arma' });
  }
}

export async function upgradeWeapon(req, res) {
  try {
    const player = req.player;
    const { itemId, level } = req.body || {};

    if (!itemId) {
      return res.status(400).json({ error: 'itemId é obrigatório' });
    }

    ensureInventory(player);

    const item = player.inventory.items.find((i) => i?.id === itemId);

    if (!item) {
      return res.status(404).json({ error: 'Arma não encontrada' });
    }

    const targetLevel = Number(level || (Number(item.level || 1) + 1));
    if (targetLevel < 1) {
      return res.status(400).json({ error: 'Nível inválido' });
    }

    const cost = Math.floor(1000 * Math.pow(1.35, Math.max(0, targetLevel - 1)));

    if ((player.balances?.dirtyMoney || 0) < cost) {
      return res.status(400).json({ error: 'Dinheiro sujo insuficiente' });
    }

    player.balances.dirtyMoney -= cost;
    item.level = targetLevel;
    item.upgradedAt = new Date().toISOString();

    bumpVersion(player);
    await player.save();

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro ao melhorar arma:', error);
    return res.status(500).json({ error: 'Erro ao melhorar arma' });
  }
}