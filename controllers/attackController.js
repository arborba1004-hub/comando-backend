import { randomUUID } from 'crypto';
import Attack from '../models/Attack.js';
import Player from '../models/Player.js';
import ChatMessage from '../models/ChatMessage.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import {
  buildTravelMetrics,
  resolveAttackResult,
  resolveSelectedMemberIdsForAttack,
} from '../services/attack/resolveAttack.js';
import { buildAttackReport } from '../services/attack/buildAttackReport.js';
import { emitToPlayer } from '../services/socketEmitter.js';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function sanitizeSelection(selection = {}) {
  return {
    capanga: Math.max(0, Math.floor(toNumber(selection.capanga, 0))),
    frente: Math.max(0, Math.floor(toNumber(selection.frente, 0))),
    executor: Math.max(0, Math.floor(toNumber(selection.executor, 0))),
    assassino: Math.max(0, Math.floor(toNumber(selection.assassino, 0))),
    muralha: Math.max(0, Math.floor(toNumber(selection.muralha, 0))),
    certeiro: Math.max(0, Math.floor(toNumber(selection.certeiro, 0))),
    motorista: Math.max(0, Math.floor(toNumber(selection.motorista, 0))),
    nitro: Math.max(0, Math.floor(toNumber(selection.nitro, 0))),
  };
}

function hasAnySelection(selection) {
  return Object.values(selection || {}).some((value) => Number(value || 0) > 0);
}

function buildResponse(attack) {
  return {
    battleId: attack.id,
    status: attack.status,
    attackerId: attack.attackerId,
    attackerName: attack.attackerName,
    defenderId: attack.targetId,
    defenderName: attack.targetName,
    routeDistanceTiles: attack.routeDistanceTiles,
    timePerTileMs: attack.timePerTileMs,
    totalDurationMs: attack.totalDurationMs,
    launchedAtIso: attack.launchedAtIso,
    arriveAtIso: attack.arriveAtIso,
    report: attack.report || null,
  };
}

function appendAttackHistory(player, item, limit = 50) {
  const next = Array.isArray(player.attackHistory) ? [...player.attackHistory] : [];
  next.unshift(item);
  player.attackHistory = next.slice(0, limit);
}

// ============================================================================
// P7: MELHORADO - ENVIO DE EMAIL COM RETRY E TRATAMENTO DE ERRO
// ============================================================================

/**
 * Envia um email de ataque com retry automático em caso de falha
 * @param {Object} params - Parâmetros do email
 * @param {string} params.senderName - Nome do remetente
 * @param {string} params.recipientId - ID do destinatário
 * @param {string} params.recipientName - Nome do destinatário
 * @param {string} params.subject - Assunto do email
 * @param {string} params.body - Corpo do email
 * @param {Object} params.metadata - Metadados do email
 * @param {number} params.maxAttempts - Número máximo de tentativas (padrão: 3)
 * @returns {Promise<{success: boolean, attempt?: number, error?: string}>}
 */
async function sendAttackMailWithRetry({
  senderName,
  recipientId,
  recipientName,
  subject,
  body,
  metadata,
  maxAttempts = 3,
}) {
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await ChatMessage.create({
        channel: 'mail',
        senderId: 'system',
        senderName,
        recipientId: String(recipientId),
        recipientName: String(recipientName),
        subject: String(subject || ''),
        body: String(body || ''),
        read: false,
        system: true,
        messageType: 'text',
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      });

      console.log(
        `[EMAIL] Enviado para ${recipientName} (${String(recipientId).slice(0, 8)}) ` +
        `(tentativa ${attempt + 1}/${maxAttempts})`
      );
      return { success: true, attempt: attempt + 1 };
    } catch (error) {
      lastError = error;
      console.warn(
        `[EMAIL] Erro ao enviar para ${recipientName} ` +
        `(tentativa ${attempt + 1}/${maxAttempts}): ${error.message}`
      );

      if (attempt < maxAttempts - 1) {
        // Aguardar progressivamente antes de tentar novamente
        const delayMs = 1000 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(
    `[EMAIL] Falha ao enviar email para ${recipientName} após ${maxAttempts} tentativas: ` +
    `${lastError?.message}`
  );
  return {
    success: false,
    error: lastError?.message || 'Erro desconhecido ao enviar email',
  };
}

/**
 * Envia email de forma síncrona (compatibilidade com código existente)
 * Usa retry interno
 */
async function sendAttackMail({
  senderName,
  recipientId,
  recipientName,
  subject,
  body,
  metadata,
}) {
  return sendAttackMailWithRetry({
    senderName,
    recipientId,
    recipientName,
    subject,
    body,
    metadata,
    maxAttempts: 2, // Menos retries para compatibilidade
  });
}

// ============================================================================
// P6: SINCRONIZAR STATUS DE MEMBROS DANIFICADOS/MORTOS
// ============================================================================

/**
 * Atualiza o status dos membros do gang baseado no resultado da batalha
 * @param {Array} members - Array de membros do gang
 * @param {Set} deadMemberIds - IDs dos membros mortos
 * @param {Set} injuredMemberIds - IDs dos membros feridos
 * @param {number} injuryDurationMs - Duração da lesão em milissegundos (padrão: 1 hora)
 */
function updateMemberStatusAfterBattle(
  members = [],
  deadMemberIds = new Set(),
  injuredMemberIds = new Set(),
  injuryDurationMs = 3600000 // 1 hora
) {
  if (!Array.isArray(members)) {
    return members;
  }

  for (const member of members) {
    if (!member || !member.id) continue;

    if (deadMemberIds.has(String(member.id))) {
      member.status = 'morto';
      member.injuryEndsAt = null;
      console.log(`[BATTLE] Membro ${member.id} marcado como morto`);
    } else if (injuredMemberIds.has(String(member.id))) {
      member.status = 'ferido';
      member.injuryEndsAt = new Date(Date.now() + injuryDurationMs).toISOString();
      console.log(
        `[BATTLE] Membro ${member.id} marcado como ferido (recupera em ${injuryDurationMs / 60000} minutos)`
      );
    } else if (member.status === 'ferido' && !injuredMemberIds.has(String(member.id))) {
      // Se era ferido mas não está mais, retorna a ativo (recuperou)
      const injuryEndTime = member.injuryEndsAt ? new Date(member.injuryEndsAt).getTime() : 0;
      if (injuryEndTime <= Date.now()) {
        member.status = 'ativo';
        member.injuryEndsAt = null;
        console.log(`[BATTLE] Membro ${member.id} recuperado de lesão`);
      }
    }
  }

  return members;
}

// ============================================================================
// PUBLIC FUNCTIONS - ENDPOINTS
// ============================================================================

/**
 * Estima o resultado de uma batalha sem executá-la
 * Útil para o frontend mostrar probabilidades ao usuário
 */
export async function estimateBattle(req, res) {
  try {
    const attacker = req.player;
    const {
      targetId,
      selection = {},
      selectedMemberIds = [],
    } = req.body || {};

    if (!targetId) {
      return res.status(400).json({ error: 'targetId é obrigatório' });
    }

    const defender = await Player.findById(String(targetId));
    if (!defender) {
      return res.status(404).json({ error: 'Defensor não encontrado' });
    }

    if (String(attacker._id) === String(defender._id)) {
      return res.status(400).json({ error: 'Você não pode atacar a si mesma' });
    }

    const safeSelection = sanitizeSelection(selection);
    if (!hasAnySelection(safeSelection) && (!Array.isArray(selectedMemberIds) || !selectedMemberIds.length)) {
      return res.status(400).json({ error: 'Seleção de ataque vazia' });
    }

    const result = resolveAttackResult({
      attacker: attacker.toObject(),
      defender: defender.toObject(),
      selection: safeSelection,
      selectedMemberIds,
    });

    return res.json({
      estimatedWinner: result.winner,
      estimatedRounds: result.rounds,
      estimatedLootDirtyMoney: result.lootDirtyMoney,
      attacker: result.attacker,
      defender: result.defender,
    });
  } catch (error) {
    console.error('[ESTIMATE] Erro em estimateBattle:', error);
    return res.status(500).json({ error: 'Erro ao estimar batalha' });
  }
}

/**
 * Inicia uma batalha e cria o registro de ataque
 * Frontend vai animar a viagem enquanto isso processa
 */
export async function startBattle(req, res) {
  try {
    const attacker = req.player;
    const {
      targetId,
      targetName,
      targetTileX,
      targetTileY,
      originTileX,
      originTileY,
      selection = {},
      selectedMemberIds = [],
    } = req.body || {};

    if (!targetId) {
      return res.status(400).json({ error: 'targetId é obrigatório' });
    }

    const defender = await Player.findById(String(targetId));
    if (!defender) {
      return res.status(404).json({ error: 'Defensor não encontrado' });
    }

    if (String(attacker._id) === String(defender._id)) {
      return res.status(400).json({ error: 'Você não pode atacar a si mesma' });
    }

    const safeSelection = sanitizeSelection(selection);
    if (!hasAnySelection(safeSelection) && (!Array.isArray(selectedMemberIds) || !selectedMemberIds.length)) {
      return res.status(400).json({ error: 'Seleção de ataque vazia' });
    }

    const resolvedSelectedMemberIds = resolveSelectedMemberIdsForAttack({
      attacker: attacker.toObject(),
      selection: safeSelection,
      selectedMemberIds,
    });

    if (!resolvedSelectedMemberIds.length) {
      return res.status(400).json({ error: 'Nenhum membro ativo disponível para o ataque' });
    }

    const origin = {
      tileX: Number.isFinite(Number(originTileX))
        ? Number(originTileX)
        : Number(attacker?.mapPosition?.tileX || 0),
      tileY: Number.isFinite(Number(originTileY))
        ? Number(originTileY)
        : Number(attacker?.mapPosition?.tileY || 0),
    };

    const target = {
      tileX: Number.isFinite(Number(targetTileX))
        ? Number(targetTileX)
        : Number(defender?.mapPosition?.tileX || 0),
      tileY: Number.isFinite(Number(targetTileY))
        ? Number(targetTileY)
        : Number(defender?.mapPosition?.tileY || 0),
    };

    const travel = buildTravelMetrics({
      origin,
      target,
      barracoLevel: attacker?.niveis?.barracoLevel || 1,
    });
const launchedAt = new Date();
    const arriveAt = new Date(launchedAt.getTime() + travel.totalDurationMs);

    const attack = await Attack.create({
      id: randomUUID(),
      status: 'travelling',
      attackerId: String(attacker._id),
      attackerName: String(attacker.name || 'Atacante'),
      targetId: String(defender._id),
      targetName: String(targetName || defender.name || 'Defensor'),
      attackerFactionId: attacker.factionId || null,
      defenderFactionId: defender.factionId || null,
      origin,
      target,
      routeDistanceTiles: travel.routeDistanceTiles,
      timePerTileMs: travel.timePerTileMs,
      totalDurationMs: travel.totalDurationMs,
      launchedAtIso: launchedAt.toISOString(),
      arriveAtIso: arriveAt.toISOString(),
      selectedTroops: Object.entries(safeSelection)
        .filter(([, quantity]) => Number(quantity) > 0)
        .map(([type, quantity]) => ({ type, quantity })),
      selectedMemberIds: resolvedSelectedMemberIds,
    });

    console.log(
      `[ATTACK] Iniciado: ${attack.attackerName} → ${attack.targetName} ` +
      `(${resolvedSelectedMemberIds.length} membros)`
    );

    return res.status(201).json({
      success: true,
      ...buildResponse(attack),
    });
  } catch (error) {
    console.error('[START_BATTLE] Erro em startBattle:', error);
    return res.status(500).json({ error: 'Erro ao iniciar batalha' });
  }
}

export async function resolveBattle(req, res) {
  try {
    const requesterId = String(req.user.id);
    const { battleId } = req.params;

    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) {
      console.warn(`[RESOLVE] Ataque não encontrado: ${battleId}`);
      return res.status(404).json({ error: 'Batalha não encontrada' });
    }

    if (String(attack.attackerId) !== requesterId) {
      console.warn(
        `[RESOLVE] Tentativa de resolver ataque de outro jogador: ${requesterId} vs ${attack.attackerId}`
      );
      return res.status(403).json({ error: 'Somente a atacante pode resolver esta batalha' });
    }

    if (attack.status === 'resolved') {
      console.log(`[RESOLVE] Ataque já resolvido: ${battleId}`);
      return res.json(buildResponse(attack));
    }

    if (attack.arriveAtIso && new Date(attack.arriveAtIso).getTime() > Date.now()) {
      const remainingMs = new Date(attack.arriveAtIso).getTime() - Date.now();
      return res.status(409).json({
        error: 'A marcha ainda não chegou ao destino',
        remainingMs,
      });
    }

    const attacker = await Player.findById(String(attack.attackerId));
    const defender = await Player.findById(String(attack.targetId));

    if (!attacker || !defender) {
      console.error(`[RESOLVE] Jogadores não encontrados: atk=${attack.attackerId}, def=${attack.targetId}`);
      return res.status(404).json({ error: 'Jogadores da batalha não encontrados' });
    }

    // =========================================================================
    // CALCULAR RESULTADO DA BATALHA
    // =========================================================================

    const result = resolveAttackResult({
      attacker: attacker.toObject(),
      defender: defender.toObject(),
      selection: Object.fromEntries(
        (Array.isArray(attack.selectedTroops) ? attack.selectedTroops : []).map((item) => [
          item.type,
          item.quantity,
        ])
      ),
      selectedMemberIds: Array.isArray(attack.selectedMemberIds) ? attack.selectedMemberIds : [],
    });

    // =========================================================================
    // ATUALIZAR BALANCES
    // =========================================================================

    attacker.balances.dirtyMoney = result.nextDirtyMoneyAtacante;
    defender.balances.dirtyMoney = result.nextDirtyMoneyDefensor;

    // =========================================================================
    // P6: SINCRONIZAR STATUS DE MEMBROS
    // =========================================================================

    // Extrair IDs de membros mortos e feridos do resultado
    const attackerDeadMemberIds = new Set(result.attackerDeadMemberIds || []);
    const defenderDeadMemberIds = new Set(result.defenderDeadMemberIds || []);
    const attackerInjuredMemberIds = new Set(result.attackerInjuredMemberIds || []);
    const defenderInjuredMemberIds = new Set(result.defenderInjuredMemberIds || []);

    // Atualizar gang do atacante
    attacker.gang = result.nextAttackerGang;
    if (attacker.gang?.members) {
      attacker.gang.members = updateMemberStatusAfterBattle(
        attacker.gang.members,
        attackerDeadMemberIds,
        attackerInjuredMemberIds,
        3600000 // 1 hora
      );
    }

    // Atualizar gang do defensor
    defender.gang = result.nextDefenderGang;
    if (defender.gang?.members) {
      defender.gang.members = updateMemberStatusAfterBattle(
        defender.gang.members,
        defenderDeadMemberIds,
        defenderInjuredMemberIds,
        3600000 // 1 hora
      );
    }

    // Registrar atualização no gang
    if (attacker.gang) {
      attacker.gang.updatedAtIso = new Date().toISOString();
    }
    if (defender.gang) {
      defender.gang.updatedAtIso = new Date().toISOString();
    }

    bumpVersion(attacker);
    bumpVersion(defender);

    // =========================================================================
    // CONSTRUIR RELATÓRIO
    // =========================================================================

    const report = buildAttackReport(result);

    attack.status = 'resolved';
    attack.success = result.winner === 'atacante';
    attack.critical = false;
    attack.loot = result.lootDirtyMoney;
    attack.resolvedAtIso = new Date().toISOString();
    attack.report = {
      winner: result.winner,
      rounds: result.rounds,
      lootDirtyMoney: result.lootDirtyMoney,
      barracoLevelPerdedor: result.barracoLevelPerdedor,
      attacker: result.attacker,
      defender: result.defender,
      attackerSubject: report.attackerSubject,
      attackerBody: report.attackerBody,
      defenderSubject: report.defenderSubject,
      defenderBody: report.defenderBody,
    };

    const historyItem = {
      id: attack.id,
      attackerId: attack.attackerId,
      attackerName: attack.attackerName,
      targetId: attack.targetId,
      targetName: attack.targetName,
      success: attack.success,
      loot: attack.loot,
      createdAt: new Date().toISOString(),
    };

    appendAttackHistory(attacker, historyItem);
    appendAttackHistory(defender, historyItem);

    // =========================================================================
    // SALVAR NO BANCO DE DADOS
    // =========================================================================

    console.log(`[RESOLVE] Salvando batalha resolvida...`);
    await Promise.all([attacker.save(), defender.save(), attack.save()]);
    emitToPlayer(String(attacker._id), 'playerUpdate', { player: mergePlayerState(attacker.toObject()) });
    emitToPlayer(String(defender._id), 'playerUpdate', { player: mergePlayerState(defender.toObject()) });
    console.log(`[RESOLVE] Batalha salva: ${battleId}`);

    // =========================================================================
    // P7: ENVIAR EMAILS COM RETRY
    // =========================================================================

    console.log(`[RESOLVE] Enviando relatórios por email...`);
    const [attackerMailResult, defenderMailResult] = await Promise.allSettled([
      sendAttackMailWithRetry({
        senderName: 'Sistema',
        recipientId: attacker._id,
        recipientName: attacker.name,
        subject: report.attackerSubject,
        body: report.attackerBody,
        metadata: {
          type: 'attack_report',
          attackId: attack.id,
          role: 'attacker',
        },
      }),
      sendAttackMailWithRetry({
        senderName: 'Sistema',
        recipientId: defender._id,
        recipientName: defender.name,
        subject: report.defenderSubject,
        body: report.defenderBody,
        metadata: {
          type: 'attack_report',
          attackId: attack.id,
          role: 'defender',
        },
      }),
    ]);

    // =========================================================================
    // REGISTRAR STATUS DE ENVIO
    // =========================================================================

    const mailErrors = [];
    if (attackerMailResult.status === 'rejected') {
      mailErrors.push('attacker');
      console.error(
        `[RESOLVE] Erro ao enviar email para atacante: ${attackerMailResult.reason?.message}`
      );
    }
    if (defenderMailResult.status === 'rejected') {
      mailErrors.push('defender');
      console.error(
        `[RESOLVE] Erro ao enviar email para defensor: ${defenderMailResult.reason?.message}`
      );
    }

    if (mailErrors.length === 0) {
      console.log(`[RESOLVE] Todos os emails enviados com sucesso`);
    }

    // Armazenar status de envio para auditoria
    attack.mailStatus = {
      sentToAttacker: attackerMailResult.status === 'fulfilled' &&
        attackerMailResult.value?.success === true,
      sentToDefensor: defenderMailResult.status === 'fulfilled' &&
        defenderMailResult.value?.success === true,
      errors: mailErrors,
      retriedAt: new Date().toISOString(),
    };

    await attack.save();

    // =========================================================================
    // RESPONDER COM SUCESSO
    // =========================================================================

    const responseData = {
      ...buildResponse(attack),
      mailStatus: attack.mailStatus,
      attacker: {
        ...result.attacker,
        gang: {
          members: attacker.gang?.members || [],
          stats: {
            totalMembers: attacker.gang?.members?.length || 0,
            activeMembers: attacker.gang?.members?.filter(m => m.status === 'ativo').length || 0,
            injuredMembers: attacker.gang?.members?.filter(m => m.status === 'ferido').length || 0,
            deadMembers: attacker.gang?.members?.filter(m => m.status === 'morto').length || 0,
          },
        },
      },
      defender: {
        ...result.defender,
        gang: {
          members: defender.gang?.members || [],
          stats: {
            totalMembers: defender.gang?.members?.length || 0,
            activeMembers: defender.gang?.members?.filter(m => m.status === 'ativo').length || 0,
            injuredMembers: defender.gang?.members?.filter(m => m.status === 'ferido').length || 0,
            deadMembers: defender.gang?.members?.filter(m => m.status === 'morto').length || 0,
          },
        },
      },
    };

    // Adicionar aviso se houver problema com email
    if (mailErrors.length > 0) {
      responseData.warning = `Relatório não foi enviado para: ${mailErrors.join(', ')}. ` +
        `Os dados da batalha foram salvos e você pode consultar o resultado depois.`;
    }

    console.log(`[RESOLVE] Batalha finalizada com sucesso: ${battleId}`);
    return res.json(responseData);

  } catch (error) {
    console.error('[RESOLVE] Erro crítico em resolveBattle:', error);
    return res.status(500).json({
      error: 'Erro ao resolver batalha',
      message: error.message,
    });
  }
}

/**
 * Retorna o relatório de uma batalha já resolvida
 */
export async function getBattleReport(req, res) {
  try {
    const requesterId = String(req.user.id);
    const { battleId } = req.params;

    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) {
      return res.status(404).json({ error: 'Batalha não encontrada' });
    }

    const allowed =
      String(attack.attackerId) === requesterId || String(attack.targetId) === requesterId;

    if (!allowed) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.json(buildResponse(attack));
  } catch (error) {
    console.error('[REPORT] Erro em getBattleReport:', error);
    return res.status(500).json({ error: 'Erro ao buscar relatório' });
  }
}

/**
 * Retorna histórico de todas as batalhas do jogador
 */
export async function getBattleHistory(req, res) {
  try {
    const requesterId = String(req.user.id);

    const attacks = await Attack.find({
      $or: [{ attackerId: requesterId }, { targetId: requesterId }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json(attacks.map((attack) => buildResponse(attack)));
  } catch (error) {
    console.error('[HISTORY] Erro em getBattleHistory:', error);
    return res.status(500).json({ error: 'Erro ao buscar histórico de batalha' });
  }
}

/**
 * Alias para compatibilidade com rotas existentes
 */
export async function initiateAttack(req, res) {
  return startBattle(req, res);
}