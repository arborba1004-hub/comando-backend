import Player from '../models/Player.js';

export async function getAllPlayers(req, res) {
  try {
    const players = await Player.find(
      {},
      {
        name: 1,
        avatar: 1,
        mapPosition: 1,
        niveis: 1,
        hierarchyBadge: 1,
        power: 1,
      }
    ).lean();

    const formattedPlayers = players.map((player) => ({
      id: String(player._id),
      name: player.name || 'Jogador',
      avatar: player.avatar || '',
      hierarchyBadge: player.hierarchyBadge || 'Soldado',
      power: typeof player.power === 'number' ? player.power : 0,
      mapPosition: {
        tileX: player.mapPosition?.tileX ?? 20,
        tileY: player.mapPosition?.tileY ?? 10,
        worldX: player.mapPosition?.worldX ?? 0,
        worldY: player.mapPosition?.worldY ?? 0,
      },
      niveis: {
        barracoLevel: player.niveis?.barracoLevel ?? 1,
        playerLevel: player.niveis?.playerLevel ?? 1,
      },
    }));

    return res.status(200).json({
      ok: true,
      players: formattedPlayers,
    });
  } catch (error) {
    console.error('Erro em GET /players:', error);

    return res.status(500).json({
      ok: false,
      error: 'Erro ao buscar jogadores',
    });
  }
}