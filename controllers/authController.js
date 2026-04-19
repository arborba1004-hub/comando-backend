import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import Player from '../models/Player.js';
import { generateFreeMapPosition } from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function signToken(playerId) {
  return jwt.sign({ id: playerId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export async function googleAuth(req, res) {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Token do Google é obrigatório',
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.sub || !payload.email) {
      return res.status(401).json({
        ok: false,
        error: 'Token Google inválido',
      });
    }

    let player = await Player.findOne({ googleId: payload.sub });

    if (!player) {
      const freeMapPosition = await generateFreeMapPosition();

      player = await Player.create({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || 'Jogador',
        avatar: payload.picture || '',
        mapPosition: freeMapPosition,
      });
    } else {
      player.name = payload.name || player.name;
      player.avatar = payload.picture || player.avatar;
      player.email = payload.email || player.email;
      player.lastLoginAt = new Date();
      await player.save();
    }

    const appToken = signToken(player._id);
    const normalizedPlayer = mergePlayerState(player.toObject());

    return res.status(200).json({
      ok: true,
      token: appToken,
      player: normalizedPlayer,
    });
  } catch (error) {
    console.error('Erro em /auth/google:', error);

    return res.status(500).json({
      ok: false,
      error: 'Erro ao autenticar com Google',
    });
  }
}