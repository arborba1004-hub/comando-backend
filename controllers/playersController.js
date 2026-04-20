import Player from '../models/Player.js';

const DEFAULT_RADIUS = 12;
const MAX_RADIUS = 18;
const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 24;
const MIN_TILE = 0;
const MAX_TILE = 119;

function toInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export async function getAllPlayers(req, res) {
  try {
    const fallbackTileX = req.player?.mapPosition?.tileX ?? 60;
    const fallbackTileY = req.player?.mapPosition?.tileY ?? 60;

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
        _id: { $ne: req.user.id },
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
        const tileX = p.mapPosition?.tileX ?? 0;
        const tileY = p.mapPosition?.tileY ?? 0;

        return {
          id: String(p._id),
          name: p.name,
          factionId: p.factionId || null,
          tileX,
          tileY,
          barracoLevel: p.niveis?.barracoLevel || 1,
          power: p.power || 0,
          distance:
            Math.abs(tileX - centerTileX) + Math.abs(tileY - centerTileY),
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