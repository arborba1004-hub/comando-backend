/**
 * socketEmitter.js
 *
 * Utilitário compartilhado para emitir eventos socket a jogadores específicos.
 * Importado por todos os controllers que mutam estado do player.
 *
 * USO:
 *   import { emitToPlayer } from '../services/socketEmitter.js';
 *   // Após player.save():
 *   emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });
 */

import { getIO, getPlayerSocketId } from './socket.js';

/**
 * Emite um evento socket para um jogador específico.
 * Fire-and-forget — nunca lança exceção, nunca bloqueia.
 *
 * @param {string} playerId - MongoDB _id do jogador
 * @param {string} event    - Nome do evento socket
 * @param {any}    data     - Payload do evento
 */
export function emitToPlayer(playerId, event, data) {
  try {
    const io       = getIO();
    const socketId = getPlayerSocketId(String(playerId));

    if (!io || !socketId) return;

    io.to(socketId).emit(event, data);
  } catch (err) {
    // Nunca lança — o jogo não pode parar por causa de um emit
    console.error(`[socketEmitter] Erro ao emitir '${event}' para ${playerId}:`, err?.message);
  }
}

/**
 * Emite o mesmo evento para múltiplos jogadores de uma vez.
 * Útil para ataques onde attacker e defender precisam ser notificados.
 *
 * @param {string[]} playerIds
 * @param {string}   event
 * @param {(id: string) => any} dataFn - Função que retorna o payload por jogador
 */
export function emitToPlayers(playerIds, event, dataFn) {
  for (const id of playerIds) {
    emitToPlayer(id, event, dataFn(id));
  }
}
