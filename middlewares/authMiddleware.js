import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import Player from '../models/Player.js';

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        ok: false,
        error: 'Token ausente ou inválido',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, env.JWT_SECRET);

    const player = await Player.findById(decoded.id);

    if (!player) {
      return res.status(401).json({
        ok: false,
        error: 'Usuário não encontrado',
      });
    }

    req.player = player;
    next();
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: 'Não autorizado',
    });
  }
}
