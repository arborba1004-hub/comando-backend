/**
 * socketEmitter.js
 * Utilitário para emitir eventos socket a jogadores específicos
 * ou broadcastar para todos os clientes conectados.
 */

import {
  emitToPlayer as _emitToPlayer,
  broadcastToAll as _broadcastToAll,
} from './socket.js';

/**
 * Emite um evento socket para um jogador específico.
 * Fire-and-forget — nunca lança exceção.
 */
export function emitToPlayer(playerId, event, data) {
  try {
    _emitToPlayer(String(playerId), event, data);
  } catch (err) {
    console.error(`[socketEmitter] Erro ao emitir '${event}' para ${playerId}:`, err?.message);
  }
}

/**
 * Emite o mesmo evento para múltiplos jogadores.
 */
export function emitToPlayers(playerIds, event, dataFn) {
  for (const id of playerIds) {
    emitToPlayer(id, event, dataFn(id));
  }
}

/**
 * Broadcast a um evento para TODOS os clientes conectados.
 *
 * @param {string} event - Nome do evento.
 * @param {object} data  - Payload do evento.
 * @param {string|null} excludePlayerId - Jogador a NÃO receber o evento
 *                                        (útil quando o emissor já trata o
 *                                        evento localmente, ex: atacante já
 *                                        anima o squad no próprio cliente).
 */
export function broadcastToAll(event, data, excludePlayerId = null) {
  try {
    _broadcastToAll(event, data, excludePlayerId);
  } catch (err) {
    console.error(`[socketEmitter] Erro ao broadcastar '${event}':`, err?.message);
  }
}
