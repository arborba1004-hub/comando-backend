/**
 * services/socket.js
 *
 * Hub central de tempo real do jogo.
 *
 * Eventos emitidos pelo servidor:
 *   playerInit    → estado completo do PRÓPRIO jogador (só para ele)
 *   mapSnapshot   → posições de todos os jogadores (só para o novo conectado)
 *   playerJoined  → broadcast quando alguém entra
 *   playerMoved   → broadcast quando alguém se move
 *   playerLeft    → broadcast quando alguém sai
 *   playerUpdate  → estado atualizado do PRÓPRIO jogador após qualquer mutação
 *                   (emitido pelos controllers via socketEmitter.js)
 *
 * Eventos recebidos do cliente:
 *   move          → { tileX, tileY } — salva posição + broadcast
 */

import { Server }          from 'socket.io';
import jwt                 from 'jsonwebtoken';
import { env }             from '../config/env.js';
import Player              from '../models/Player.js';
import { mergePlayerState } from '../utils/playerMapper.js';

/** @type {import('socket.io').Server | null} */
let io = null;

/** socketId → playerId */
const socketToPlayer = new Map();

/** playerId → socketId  (para emitToPlayer) */
const playerToSocket = new Map();

// ─── Exports ─────────────────────────────────────────────────────────────────

export function getIO() { return io; }

export function getPlayerSocketId(playerId) {
  return playerToSocket.get(String(playerId)) ?? null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function projectForMap(player) {
  return {
    id:           String(player._id),
    name:         player.name         ?? 'Jogador',
    tileX:        player.mapPosition?.tileX  ?? 0,
    tileY:        player.mapPosition?.tileY  ?? 0,
    barracoLevel: player.niveis?.barracoLevel ?? 1,
    power:        player.power        ?? 0,
    factionId:    player.factionId    ?? null,
  };
}

async function fetchMapSnapshot(limit = 1000) {
  const players = await Player.find(
    {},
    { _id: 1, name: 1, mapPosition: 1, power: 1, factionId: 1, 'niveis.barracoLevel': 1 }
  )
    .limit(limit)
    .lean();
  return players.map(projectForMap);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin:      env.FRONTEND_URL === '*' ? true : env.FRONTEND_URL,
      credentials: true,
    },
    transports:    ['websocket', 'polling'],
    pingTimeout:   20000,
    pingInterval:  10000,
  });

  // ── Middleware de autenticação JWT ────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const raw =
        socket.handshake.auth?.token ??
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!raw || typeof raw !== 'string') return next(new Error('TOKEN_MISSING'));

      const decoded = jwt.verify(raw, env.JWT_SECRET);

      const player = await Player.findById(decoded.id)
        .select('_id name mapPosition niveis power factionId')
        .lean();

      if (!player) return next(new Error('PLAYER_NOT_FOUND'));

      socket.data.playerId    = String(player._id);
      socket.data.playerName  = player.name ?? 'Jogador';
      socket.data.barracoLevel = player.niveis?.barracoLevel ?? 1;
      socket.data.power       = player.power ?? 0;
      socket.data.factionId   = player.factionId ?? null;
      socket.data.tileX       = player.mapPosition?.tileX ?? 0;
      socket.data.tileY       = player.mapPosition?.tileY ?? 0;

      next();
    } catch (err) {
      next(new Error('TOKEN_INVALID'));
    }
  });

  // ── Conexão ───────────────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const { playerId, playerName } = socket.data;

    // Desconecta socket antigo do mesmo player (multi-aba)
    const oldSocketId = playerToSocket.get(playerId);
    if (oldSocketId && oldSocketId !== socket.id) {
      io.sockets.sockets.get(oldSocketId)?.disconnect(true);
    }

    socketToPlayer.set(socket.id, playerId);
    playerToSocket.set(playerId, socket.id);

    console.log(`🟢 ${playerName} (${playerId}) conectou`);

    // ── 1. playerInit: estado completo do PRÓPRIO jogador ─────────────────
    try {
      const fullPlayer = await Player.findById(playerId).lean();
      if (fullPlayer) {
        socket.emit('playerInit', {
          player: mergePlayerState(fullPlayer),
        });
      }
    } catch (err) {
      console.error('❌ Erro ao emitir playerInit:', err.message);
    }

    // ── 2. mapSnapshot: posições de todos no mapa ─────────────────────────
    try {
      const snapshot = await fetchMapSnapshot();
      socket.emit('mapSnapshot', snapshot);
    } catch (err) {
      console.error('❌ Erro ao emitir mapSnapshot:', err.message);
    }

    // ── 3. Anuncia chegada para os outros ─────────────────────────────────
    socket.broadcast.emit('playerJoined', {
      id:          playerId,
      name:        playerName,
      tileX:       socket.data.tileX,
      tileY:       socket.data.tileY,
      barracoLevel: socket.data.barracoLevel,
      power:       socket.data.power,
      factionId:   socket.data.factionId,
    });

    // ── 4. Movimento ──────────────────────────────────────────────────────
    // Salva posição no MongoDB (fire-and-forget) e faz broadcast imediato.
    // NÃO espera o save para emitir — latência ~0ms para outros jogadores.
    socket.on('move', (data) => {
      const tileX = Number(data?.tileX);
      const tileY = Number(data?.tileY);
      if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;

      const clampedX = Math.max(0, Math.min(119, Math.trunc(tileX)));
      const clampedY = Math.max(0, Math.min(119, Math.trunc(tileY)));

      socket.data.tileX = clampedX;
      socket.data.tileY = clampedY;

      // Salva no DB sem bloquear o broadcast
      Player.findByIdAndUpdate(playerId, {
        $set: {
          'mapPosition.tileX': clampedX,
          'mapPosition.tileY': clampedY,
        },
      }).catch((err) => console.error('❌ Erro ao salvar posição:', err.message));

      // Broadcast imediato para TODOS (inclusive quem enviou)
      io.emit('playerMoved', {
        playerId,
        name:  playerName,
        tileX: clampedX,
        tileY: clampedY,
      });
    });

    // ── 5. Desconexão ─────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      socketToPlayer.delete(socket.id);
      if (playerToSocket.get(playerId) === socket.id) {
        playerToSocket.delete(playerId);
      }
      console.log(`🔴 ${playerName} (${playerId}) desconectou [${reason}]`);
      io.emit('playerLeft', { playerId });
    });
  });
}
