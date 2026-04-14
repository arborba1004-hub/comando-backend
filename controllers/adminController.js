import Player from '../models/Player.js';

import Faction from '../models/Faction.js';
import ChatMessage from '../models/ChatMessage.js';
import Attack from '../models/Attack.js';

export async function resetAllData(req, res) {
  try {
    const player = req.player;

    if (player.email !== 'admin@dominio.com') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    await Player.deleteMany({});
    
    await Faction.deleteMany({});
    await ChatMessage.deleteMany({});
    await Attack.deleteMany({});

    return res.json({
      success: true,
      message: 'Banco de dados resetado com sucesso',
    });
  } catch (error) {
    console.error('Erro ao resetar banco:', error);
    return res.status(500).json({ error: 'Erro ao resetar banco' });
  }
}