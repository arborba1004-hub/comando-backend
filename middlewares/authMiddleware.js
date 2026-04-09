import jwt from 'jsonwebtoken';
import Player from '../models/Player.js';
import { env } from '../config/env.js';

export default async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não informado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);

    const player = await Player.findById(decoded.id);

    if (!player) {
      return res.status(401).json({ error: 'Player não encontrado' });
    }

    req.user = {
      id: String(player._id),
      name: player.name,
      factionId: player.factionId || null,
      gangId: player.gangId || null,
    };

    req.player = player;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}