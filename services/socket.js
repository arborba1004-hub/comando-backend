import { WebSocketServer } from 'ws';
import jwt                 from 'jsonwebtoken';
import { env }             from '../config/env.js';
import Player              from '../models/Player.js';
import { mergePlayerState } from '../utils/playerMapper.js';

let wss = null;

const socketToPlayer = new Map(); // wsId → playerId
const playerToSocket = new Map(); // playerId → ws
const playerMoveTimestamps      = new Map();
const playerTeleportTimestamps  = new Map();

const MOVE_COOLDOWN_MS     = 1000;
const TELEPORT_COOLDOWN_MS = 30000;

// ── Helpers ────────────────────────────────────────────────────────────────
function send(ws, event, data) {
  if (ws.readyState === 1) { // OPEN
    ws.send(JSON.stringify({ event, data }));
  }
}

function broadcast(event, data, excludeWs = null) {
  if (!wss) return;
  for (const client of wss.clients) {
    if (client.readyState === 1 && client !== excludeWs) {
      client.send(JSON.stringify({ event, data }));
    }
  }
}

// Broadcast público para uso fora do socket.js (controllers, services).
// excludePlayerId: jogador que NÃO deve receber o evento (útil quando o
// emissor já trata o evento localmente — ex: o atacante já anima o squad
// no próprio cliente via confirmAttack).
export function broadcastToAll(event, data, excludePlayerId = null) {
  if (!wss) return;
  const excludeWs = excludePlayerId
    ? (playerToSocket.get(String(excludePlayerId)) ?? null)
    : null;
  broadcast(event, data, excludeWs);
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

export function getIO() { return wss; }

export function getPlayerSocketId(playerId) {
  return playerToSocket.get(String(playerId)) ?? null;
}

// ── Emite para um jogador específico (usado pelos controllers) ─────────────
export function emitToPlayer(playerId, event, data) {
  const ws = playerToSocket.get(String(playerId));
  if (ws) send(ws, event, data);
}

// ── Init ───────────────────────────────────────────────────────────────────
export function initSocket(server) {
  wss = new WebSocketServer({ server, path: '/socket' });

  wss.on('connection', async (ws, req) => {
    // ── Autenticação JWT via query string ──────────────────────────────────
    let playerId, playerName, barracoLevel, power, factionId, tileX, tileY;

    try {
      const url   = new URL(req.url, 'http://localhost');
      const token = url.searchParams.get('token');
      if (!token) { ws.close(1008, 'TOKEN_MISSING'); return; }

      const decoded = jwt.verify(token, env.JWT_SECRET);
      const player  = await Player.findById(decoded.id)
        .select('_id name mapPosition niveis power factionId')
        .lean();
      if (!player) { ws.close(1008, 'PLAYER_NOT_FOUND'); return; }

      playerId     = String(player._id);
      playerName   = player.name ?? 'Jogador';
      barracoLevel = player.niveis?.barracoLevel ?? 1;
      power        = player.power ?? 0;
      factionId    = player.factionId ?? null;
      tileX        = player.mapPosition?.tileX ?? 0;
      tileY        = player.mapPosition?.tileY ?? 0;
    } catch (err) {
      ws.close(1008, 'TOKEN_INVALID');
      return;
    }

    // Desconecta socket antigo do mesmo player (multi-aba)
    const oldWs = playerToSocket.get(playerId);
    if (oldWs && oldWs !== ws) oldWs.close(1000, 'REPLACED');

    playerToSocket.set(playerId, ws);
    socketToPlayer.set(ws, playerId);
    console.log(`🟢 ${playerName} (${playerId}) conectou`);

    // ── 1. playerInit ──────────────────────────────────────────────────────
    try {
      const fullPlayer = await Player.findById(playerId).lean();
      if (fullPlayer) {
        send(ws, 'playerInit', { player: mergePlayerState(fullPlayer) });
      }
    } catch (err) {
      console.error('❌ playerInit:', err.message);
    }

    // ── 2. mapSnapshot — exclui o próprio jogador ──────────────────────────
    try {
      const snapshot = await fetchMapSnapshot();
      const filtered = snapshot.filter((p) => p.id !== playerId);
      send(ws, 'mapSnapshot', filtered);
    } catch (err) {
      console.error('❌ mapSnapshot:', err.message);
    }

    // ── 3. Anuncia chegada para os outros ──────────────────────────────────
    broadcast('playerJoined', {
      id: playerId, name: playerName,
      tileX, tileY, barracoLevel, power, factionId,
    }, ws);

    // ── Mensagens do cliente ───────────────────────────────────────────────
    ws.on('message', async (raw) => {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return; }

      const { event, data } = parsed;

      // ── move ──────────────────────────────────────────────────────────────
      if (event === 'move') {
        const tx = Number(data?.tileX);
        const ty = Number(data?.tileY);
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;

        const now = Date.now();
        if (now - (playerMoveTimestamps.get(playerId) || 0) < MOVE_COOLDOWN_MS) {
          send(ws, 'error', { code: 'COOLDOWN_ACTIVE', message: 'Aguarde 1s entre movimentos' });
          return;
        }
        playerMoveTimestamps.set(playerId, now);

        const cx = clampTile(tx); const cy = clampTile(ty);
        tileX = cx; tileY = cy;

        Player.findByIdAndUpdate(playerId, {
          $set: { 'mapPosition.tileX': cx, 'mapPosition.tileY': cy },
        }).catch((e) => console.error('❌ move save:', e.message));

        broadcast('playerMoved', { playerId, name: playerName, tileX: cx, tileY: cy }, ws);
      }

      // ── teleport ──────────────────────────────────────────────────────────
      else if (event === 'teleport') {
        const tx = Number(data?.tileX);
        const ty = Number(data?.tileY);
        if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;

        const now = Date.now();
        const last = playerTeleportTimestamps.get(playerId) || 0;
        if (now - last < TELEPORT_COOLDOWN_MS) {
          const remaining = Math.ceil((TELEPORT_COOLDOWN_MS - (now - last)) / 1000);
          send(ws, 'error', { code: 'COOLDOWN_ACTIVE', message: `Aguarde ${remaining}s para teleportar` });
          return;
        }
        playerTeleportTimestamps.set(playerId, now);

        const cx = clampTile(tx); const cy = clampTile(ty);
        const oldPosition = { tileX, tileY };
        const newPosition = { tileX: cx, tileY: cy };
        tileX = cx; tileY = cy;

        Player.findByIdAndUpdate(playerId, {
          $set: { 'mapPosition.tileX': cx, 'mapPosition.tileY': cy },
        }).catch((e) => console.error('❌ teleport save:', e.message));

        broadcast('playerTeleported', {
          playerId, name: playerName,
          oldPosition, newPosition,
          teleportType: data?.teleportType || 'manual',
          timestamp: new Date().toISOString(),
        }, ws);
      }

      // ── requestBarracoInfo ────────────────────────────────────────────────
      else if (event === 'requestBarracoInfo') {
        try {
          const targetId = String(data?.targetPlayerId || '');
          if (!targetId) { send(ws, 'error', { code: 'INVALID_PLAYER' }); return; }

          const target = await Player.findById(targetId)
            .select('_id name avatar niveis mapPosition power factionId hierarchyBadge attackHistory')
            .lean();
          if (!target) { send(ws, 'error', { code: 'PLAYER_NOT_FOUND' }); return; }

          let factionName = null, factionTag = null;
          if (target.factionId) {
            try {
              const Faction = (await import('../models/Faction.js')).default;
              const faction = await Faction.findOne({ id: String(target.factionId) })
                .select('name tag').lean();
              if (faction) { factionName = faction.name; factionTag = faction.tag; }
            } catch { /* silencioso */ }
          }

          send(ws, 'barracoInfo', {
            playerId:       String(target._id),
            playerName:     target.name || 'Jogador',
            avatarUrl:      target.avatar || null,
            barracoLevel:   target.niveis?.barracoLevel || 1,
            barracoName:    getBarracoName(target.niveis?.barracoLevel || 1),
            tileX:          target.mapPosition?.tileX || 0,
            tileY:          target.mapPosition?.tileY || 0,
            factionId:      target.factionId || null,
            factionName,    factionTag,
            level:          target.niveis?.playerLevel || 1,
            power:          target.power || 0,
            hierarchyBadge: target.hierarchyBadge || 'Antena',
            attackHistory:  Array.isArray(target.attackHistory)
              ? target.attackHistory.slice(-5) : [],
          });
        } catch (err) {
          console.error('❌ requestBarracoInfo:', err.message);
          send(ws, 'error', { code: 'SERVER_ERROR' });
        }
      }

      // ── requestMapSnapshot ────────────────────────────────────────────────
      else if (event === 'requestMapSnapshot') {
        try {
          const snapshot = await fetchMapSnapshot();
          const filtered = snapshot.filter((p) => p.id !== playerId);
          send(ws, 'mapSnapshot', filtered);
        } catch (err) {
          console.error('❌ requestMapSnapshot:', err.message);
        }
      }
    });

    // ── Desconexão ─────────────────────────────────────────────────────────
    ws.on('close', () => {
      socketToPlayer.delete(ws);
      if (playerToSocket.get(playerId) === ws) {
        playerToSocket.delete(playerId);
      }
      playerMoveTimestamps.delete(playerId);
      playerTeleportTimestamps.delete(playerId);
      console.log(`🔴 ${playerName} (${playerId}) desconectou`);
      broadcast('playerLeft', { playerId });
    });

    ws.on('error', (err) => {
      console.error(`⚠️ WebSocket error (${playerName}):`, err.message);
    });
  });
}
