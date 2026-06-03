import jwt from 'jsonwebtoken';
import Player from '../models/Player.js';
import { env } from '../config/env.js';

function readBearerToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.split(' ')[1];
}

/**
 * Middleware leve: valida JWT sem carregar o documento inteiro do jogador.
 * Use em rotas de leitura/snapshot que só precisam de req.user.id.
 */
export async function authOnly(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Token não informado' });

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const id = String(decoded?.id || '').trim();
    if (!id) return res.status(401).json({ error: 'Token inválido' });

    req.user = {
      id,
      name: decoded?.name || null,
      factionId: decoded?.factionId || null,
      gangId: decoded?.gangId || null,
    };

    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

/**
 * Middleware completo: valida JWT e carrega o Player como documento Mongoose.
 * Use apenas em rotas que precisam salvar/mutar player ou calcular estado completo.
 */
export default async function authMiddleware(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Token não informado' });

    const decoded = jwt.verify(token, env.JWT_SECRET);
    const id = String(decoded?.id || '').trim();
    if (!id) return res.status(401).json({ error: 'Token inválido' });

    const player = await Player.findById(id);
    if (!player) return res.status(401).json({ error: 'Player não encontrado' });

    req.user = {
      id: String(player._id),
      name: player.name,
      factionId: player.factionId || null,
      gangId: player.gangId || null,
    };

    req.player = player;
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}
