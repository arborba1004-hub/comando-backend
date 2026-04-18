import Player from '../models/Player.js';

export async function getAllPlayers(req, res) {
  try {
    const players = await Player.find(
      {},
      {
        _id: 1,
        name: 1,
        factionId: 1,
        mapPosition: 1,
        power: 1,
        balances: 1,
        'niveis.barracoLevel': 1,
      }
    ).lean();

    const formatted = players.map((p) => ({
      id: String(p._id),
      name: p.name,
      factionId: p.factionId || null,
      tileX: p.mapPosition?.tileX || 0,
      tileY: p.mapPosition?.tileY || 0,
      worldX: p.mapPosition?.worldX || 0,
      worldY: p.mapPosition?.worldY || 0,
      barracoLevel: p.niveis?.barracoLevel || 1,
      power: p.power || 0,
      dirtyMoney: p.balances?.dirtyMoney || 0,
    }));

    return res.json(formatted);
  } catch (error) {
    console.error('Erro ao buscar players:', error);
    return res.status(500).json({ error: 'Erro ao buscar players' });
  }
}