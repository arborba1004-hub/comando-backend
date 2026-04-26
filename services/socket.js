/**
 * services/socket.js
 *
 * Eventos emitidos pelo servidor:
 *   playerInit       → estado completo do PRÓPRIO jogador (só para ele)
 *   mapSnapshot      → posições de todos os jogadores EXCETO o próprio
 *   playerJoined     → broadcast quando alguém entra (exceto o próprio)
 *   playerMoved      → broadcast quando alguém se move (exceto o próprio)
 *   playerTeleported → broadcast quando alguém se teleporta (exceto o próprio)
 *   playerLeft       → broadcast quando alguém sai
 *   barracoInfo      → dados do barraco de um jogador (sob demanda)
 *   playerUpdate     → estado atualizado do PRÓPRIO jogador após qualquer mutação
 *
 * Eventos recebidos do cliente:
 *   move               → { tileX, tileY } — cooldown 1s
 *   teleport           → { tileX, tileY, teleportType } — cooldown 30s
 *   requestBarracoInfo → { targetPlayerId }
 *   requestMapSnapshot → solicita reenvio do mapSnapshot
 */

import { Server }           from 'socket.io';
import jwt                  from 'jsonwebtoken';
import { env }              from '../config/env.js';
import Player               from '../models/Player.js';
import { mergePlayerState } from '../utils/playerMapper.js';

/** @type {import('socket.io').Server | null} */
let io = null;

const socketToPlayer         = new Map();
const playerToSocket         = new Map();
const playerMoveTimestamps   = new Map();
const playerTeleportTimestamps = new Map();

const MOVE_COOLDOWN_MS      = 1000;
const TELEPORT_COOLDOWN_MS  = 30000;

export function getIO() { return io; }

export function getPlayerSocketId(playerId) {
  return playerToSocket.get(String(playerId)) ?? null;
}

function projectForMap(player) {
  return {
    id:           String(player._id),
    name:         player.name               ?? 'Jogador',
    tileX:        player.mapPosition?.tileX ?? 0,
    tileY:        player.mapPosition?.tileY ?? 0,
    barracoLevel: player.niveis?.barracoLevel ?? 1,
    power:        player.power              ?? 0,
    factionId:    player.factionId          ?? null,
  };
}

async function fetchMapSnapshot(limit = 1000) {
  const players = await Player.find(
    {},
    { _id: 1, name: 1, mapPosition: 1, power: 1, factionId: 1, 'niveis.barracoLevel': 1 }
  ).limit(limit).lean();
  return players.map(projectForMap);
}

function clampTile(value) {
  return Math.max(0, Math.min(119, Math.trunc(Number(value))));
}

function getBarracoName(level) {
  const lv = Math.max(1, Number(level || 1));
  if (lv >= 90) return 'Mansão com Heliporto';
  if (lv >= 80) return 'Mansão Blindada';
  if (lv >= 70) return 'Mansão do Complexo';
  if (lv >= 60) return 'Triplex com Piscina';
  if (lv >= 50) return 'Triplex Alto Padrão';
  if (lv >= 40) return 'Sobrado de Luxo';
  if (lv >= 30) return 'Sobrado com Piscina';
  if (lv >= 20) return 'Sobrado';
  if (lv >= 10) return 'Casa de Alvenaria';
  return 'Barraco Inicial';
}

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin:      env.FRONTEND_URL === '*' ? true : env.FRONTEND_URL,
      credentials: true,
    },
    transports:   ['websocket', 'polling'],
    pingTimeout:  20000,
    pingInterval: 10000,
  });

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
      socket.data.playerId     = String(player._id);
      socket.data.playerName   = player.name ?? 'Jogador';
      socket.data.barracoLevel = player.niveis?.barracoLevel ?? 1;
      socket.data.power        = player.power ?? 0;
      socket.data.factionId    = player.factionId ?? null;
      socket.data.tileX        = player.mapPosition?.tileX ?? 0;
      socket.data.tileY        = player.mapPosition?.tileY ?? 0;
      next();
    } catch (err) {
      next(new Error('TOKEN_INVALID'));
    }
  });

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

    // ── 1. playerInit ────────────────────────────────────────────────────
    try {
      const fullPlayer = await Player.findById(playerId).lean();
      if (fullPlayer) {
        socket.emit('playerInit', { player: mergePlayerState(fullPlayer) });
      }
    } catch (err) {
      console.error('❌ Erro ao emitir playerInit:', err.message);
    }

    // ── 2. mapSnapshot — FIX: filtra o próprio jogador ───────────────────
    // O cliente renderiza seu próprio barraco via mountPlayerMapSpace.
    // Incluir o próprio jogador causaria duplicidade no mapa.
    try {
      const snapshot = await fetchMapSnapshot();
      const filteredSnapshot = snapshot.filter((p) => p.id !== playerId);
      socket.emit('mapSnapshot', filteredSnapshot);
    } catch (err) {
      console.error('❌ Erro ao emitir mapSnapshot:', err.message);
    }

    // ── 3. Anuncia chegada para os outros (broadcast já exclui o próprio) ─
    socket.broadcast.emit('playerJoined', {
      id:           playerId,
      name:         playerName,
      tileX:        socket.data.tileX,
      tileY:        socket.data.tileY,
      barracoLevel: socket.data.barracoLevel,
      power:        socket.data.power,
      factionId:    socket.data.factionId,
    });

    // ── 4. Movimento (cooldown 1s) ────────────────────────────────────────
    socket.on('move', (data) => {
      const tileX = Number(data?.tileX);
      const tileY = Number(data?.tileY);
      if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;

      const now = Date.now();
      const lastMove = playerMoveTimestamps.get(playerId) || 0;
      if (now - lastMove < MOVE_COOLDOWN_MS) {
        socket.emit('error', { code: 'COOLDOWN_ACTIVE', message: 'Aguarde 1 segundo entre movimentos' });
        return;
      }
      playerMoveTimestamps.set(playerId, now);

      const clampedX = clampTile(tileX);
      const clampedY = clampTile(tileY);
      socket.data.tileX = clampedX;
      socket.data.tileY = clampedY;

      Player.findByIdAndUpdate(playerId, {
        $set: { 'mapPosition.tileX': clampedX, 'mapPosition.tileY': clampedY },
      }).catch((err) => console.error('❌ Erro ao salvar posição:', err.message));

      // FIX: broadcast.emit exclui o próprio socket.
      // io.emit enviaria para o próprio cliente, causando duplicidade.
      socket.broadcast.emit('playerMoved', {
        playerId,
        name:  playerName,
        tileX: clampedX,
        tileY: clampedY,
      });
    });

    // ── 5. Teleporte (cooldown 30s) ───────────────────────────────────────
    socket.on('teleport', (data) => {
      const tileX = Number(data?.tileX);
      const tileY = Number(data?.tileY);
      if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;

      const now = Date.now();
      const lastTeleport = playerTeleportTimestamps.get(playerId) || 0;
      if (now - lastTeleport < TELEPORT_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((TELEPORT_COOLDOWN_MS - (now - lastTeleport)) / 1000);
        socket.emit('error', { code: 'COOLDOWN_ACTIVE', message: `Aguarde ${remainingSeconds}s para teleportar novamente` });
        return;
      }
      playerTeleportTimestamps.set(playerId, now);

      const clampedX = clampTile(tileX);
      const clampedY = clampTile(tileY);
      const oldPosition = { tileX: socket.data.tileX, tileY: socket.data.tileY };
      const newPosition = { tileX: clampedX, tileY: clampedY };

      socket.data.tileX = clampedX;
      socket.data.tileY = clampedY;

      Player.findByIdAndUpdate(playerId, {
        $set: { 'mapPosition.tileX': clampedX, 'mapPosition.tileY': clampedY },
      }).catch((err) => console.error('❌ Erro ao salvar posição (teleporte):', err.message));

      // FIX: broadcast.emit exclui o próprio socket.
      socket.broadcast.emit('playerTeleported', {
        playerId,
        name: playerName,
        oldPosition,
        newPosition,
        teleportType: data?.teleportType || 'manual',
        timestamp: new Date().toISOString(),
      });
    });

    // ── 6. requestBarracoInfo ─────────────────────────────────────────────
    socket.on('requestBarracoInfo', async (data) => {
      try {
        const targetPlayerId = String(data?.targetPlayerId || '');
        if (!targetPlayerId) {
          socket.emit('error', { code: 'INVALID_PLAYER', message: 'ID do jogador não informado' });
          return;
        }
        const target = await Player.findById(targetPlayerId)
          .select('_id name avatar niveis mapPosition power factionId hierarchyBadge attackHistory')
          .lean();
        if (!target) {
          socket.emit('error', { code: 'PLAYER_NOT_FOUND', message: 'Jogador não encontrado' });
          return;
        }
        let factionName = null;
        let factionTag  = null;
        if (target.factionId) {
          try {
            const Faction = (await import('../models/Faction.js')).default;
            const faction = await Faction.findOne({ id: String(target.factionId) })
              .select('name tag').lean();
            if (faction) { factionName = faction.name; factionTag = faction.tag; }
          } catch { /* silencioso */ }
        }
        socket.emit('barracoInfo', {
          playerId:       String(target._id),
          playerName:     target.name || 'Jogador',
          avatarUrl:      target.avatar || null,
          barracoLevel:   target.niveis?.barracoLevel || 1,
          barracoName:    getBarracoName(target.niveis?.barracoLevel || 1),
          tileX:          target.mapPosition?.tileX || 0,
          tileY:          target.mapPosition?.tileY || 0,
          factionId:      target.factionId || null,
          factionName,
          factionTag,
          level:          target.niveis?.playerLevel || 1,
          power:          target.power || 0,
          hierarchyBadge: target.hierarchyBadge || 'Antena',
          attackHistory:  Array.isArray(target.attackHistory) ? target.attackHistory.slice(-5) : [],
        });
      } catch (err) {
        console.error('❌ Erro ao buscar barraco:', err.message);
        socket.emit('error', { code: 'SERVER_ERROR', message: 'Erro ao buscar informações do barraco' });
      }
    });

    // ── 7. requestMapSnapshot — FIX: filtra o próprio jogador ────────────
    socket.on('requestMapSnapshot', async () => {
      try {
        const snapshot = await fetchMapSnapshot();
        const filteredSnapshot = snapshot.filter((p) => p.id !== playerId);
        socket.emit('mapSnapshot', filteredSnapshot);
      } catch (err) {
        console.error('❌ Erro ao reenviar mapSnapshot:', err.message);
      }
    });

    // ── 8. Desconexão ─────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      socketToPlayer.delete(socket.id);
      if (playerToSocket.get(playerId) === socket.id) {
        playerToSocket.delete(playerId);
      }
      playerMoveTimestamps.delete(playerId);
      playerTeleportTimestamps.delete(playerId);
      console.log(`🔴 ${playerName} (${playerId}) desconectou [${reason}]`);
      io.emit('playerLeft', { playerId });
    });
  });
}