/**
 * socketEmitter.js
 * Utilitário para emitir eventos socket a jogadores específicos.
 */

import { emitToPlayer as _emitToPlayer } from './socket.js';

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