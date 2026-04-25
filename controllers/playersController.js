import Player from '../models/Player.js';

const DEFAULT_RADIUS = 12;
const MAX_RADIUS = 18;
const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 24;
const DEFAULT_SNAPSHOT_LIMIT = 1000;
const MAX_SNAPSHOT_LIMIT = 1000;
const MIN_TILE = 0;
const MAX_TILE = 119;

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function projectPlayerForMap(player) {
  const tileX = player.mapPosition?.tileX ?? 0;
  const tileY = player.mapPosition?.tileY ?? 0;

  return {
    id: String(player._id),
    name: player.name,
    factionId: player.factionId || null,
    tileX,
    tileY,
    barracoLevel: player.niveis?.barracoLevel || 1,
    power: player.power || 0,
  };
}

// 🔹 Busca players próximos (usado pra mapa com raio)
export async function getAllPlayers(req, res) {
  try {
    const fallbackTileX = 60;
    const fallbackTileY = 60;

    const centerTileX = clamp(
      toInt(req.query.centerTileX, fallbackTileX),
      MIN_TILE,
      MAX_TILE
    );
    const centerTileY = clamp(
      toInt(req.query.centerTileY, fallbackTileY),
      MIN_TILE,
      MAX_TILE
    );
    const radius = clamp(
      toInt(req.query.radius, DEFAULT_RADIUS),
      1,
      MAX_RADIUS
    );
    const limit = clamp(
      toInt(req.query.limit, DEFAULT_LIMIT),
      1,
      MAX_LIMIT
    );

    const minTileX = clamp(centerTileX - radius, MIN_TILE, MAX_TILE);
    const maxTileX = clamp(centerTileX + radius, MIN_TILE, MAX_TILE);
    const minTileY = clamp(centerTileY - radius, MIN_TILE, MAX_TILE);
    const maxTileY = clamp(centerTileY + radius, MIN_TILE, MAX_TILE);

    const players = await Player.find(
      {
        'mapPosition.tileX': { $gte: minTileX, $lte: maxTileX },
        'mapPosition.tileY': { $gte: minTileY, $lte: maxTileY },
      },
      {
        _id: 1,
        name: 1,
        factionId: 1,
        mapPosition: 1,
        power: 1,
        'niveis.barracoLevel': 1,
      }
    ).lean();

    const formatted = players
      .map((p) => {
        const projected = projectPlayerForMap(p);
        return {
          ...projected,
          distance:
            Math.abs(projected.tileX - centerTileX) +
            Math.abs(projected.tileY - centerTileY),
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit)
      .map(({ distance, ...player }) => player);

    return res.json(formatted);
  } catch (error) {
    console.error('Erro ao buscar players do mapa:', error);
    return res.status(500).json({ error: 'Erro ao buscar players do mapa' });
  }
}

// 🔥 SNAPSHOT GLOBAL (SEM AUTH / SEM FILTRO)
export async function getMapPlayersSnapshot(req, res) {
  try {
    const limit = clamp(
      toInt(req.query.limit, DEFAULT_SNAPSHOT_LIMIT),
      1,
      MAX_SNAPSHOT_LIMIT
    );

    const players = await Player.find(
      {}, // 🔥 SEM FILTRO (ESSENCIAL)
      {
        _id: 1,
        name: 1,
        factionId: 1,
        mapPosition: 1,
        power: 1,
        'niveis.barracoLevel': 1,
      }
    )
      .sort({ 'mapPosition.tileY': 1, 'mapPosition.tileX': 1, _id: 1 })
      .limit(limit)
      .lean();

    return res.json(players.map(projectPlayerForMap));
  } catch (error) {
    console.error('Erro ao buscar snapshot global do mapa:', error);
    return res.status(500).json({
      error: 'Erro ao buscar snapshot global do mapa',
    });
  }
}