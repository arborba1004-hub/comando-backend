import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion } from '../utils/gameHelpers.js';

export async function buyFugaVehicle(req, res) {
  try {
    const player = req.player;
    const { vehicleId, name, speed = 0, price, currency = 'cleanMoney' } = req.body || {};

    if (!vehicleId || !name) {
      return res.status(400).json({ error: 'Dados do veículo de fuga incompletos' });
    }

    const amount = Number(price || 0);
    if (amount < 0) {
      return res.status(400).json({ error: 'Preço inválido' });
    }

    if (!Array.isArray(player.ownedVehicles)) {
      player.ownedVehicles = [];
    }

    if ((player.balances?.[currency] || 0) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    player.balances[currency] -= amount;

    if (!player.ownedVehicles.includes(String(vehicleId))) {
      player.ownedVehicles.push(String(vehicleId));
    }

    if (!player.inventory || !Array.isArray(player.inventory.items)) {
      player.inventory = player.inventory || {};
      player.inventory.items = [];
    }

    const exists = player.inventory.items.find((item) => item?.id === vehicleId);
    if (!exists) {
      player.inventory.items.push({
        id: String(vehicleId),
        name: String(name),
        category: 'vehicle',
        speed: Number(speed || 0),
        level: 1,
        purchasedAt: new Date().toISOString(),
        source: 'fuga',
      });
    }

    bumpVersion(player);
    await player.save();

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro ao comprar veículo de fuga:', error);
    return res.status(500).json({ error: 'Erro ao comprar veículo de fuga' });
  }
}