// controllers/attackController.js

import { randomUUID } from 'crypto';
import Attack      from '../models/Attack.js';
import Player      from '../models/Player.js';
import ChatMessage from '../models/ChatMessage.js';
import { bumpVersion }      from '../utils/gameHelpers.js';
import { emitToPlayer, broadcastToAll }     from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import {
  buildTravelMetrics,
  resolveAttackResult,
  resolveSelectedMemberIdsForAttack,
} from '../services/attack/resolveAttack.js';
import { buildAttackReport } from '../services/attack/buildAttackReport.js';
import { requireOwnedConvoy } from '../utils/convoyInventory.js';

// ═════════════════════════════════════════════════════════════════════════════
// UTILS
// ═════════════════════════════════════════════════════════════════════════════

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getRequesterId(req) {
  return String(req?.user?.id || req?.player?._id || '');
}

function isRequestAuthenticated(req) {
  return Boolean(getRequesterId(req));
}

// O mapPosition salvo no Player representa a origem/canto do espaço do jogador.
// A marcha precisa sair do centro do lote do atacante e chegar no centro do lote
// do defensor. Mantém 6x6 porque o frontend atual usa PLAYER_SPACE_WIDTH/HEIGHT = 6.
const ATTACK_SPACE_WIDTH_TILES  = 6;
const ATTACK_SPACE_HEIGHT_TILES = 6;

function getAttackCenterFromMapPosition(position = {}) {
  const originTileX = toNumber(position?.tileX, 0);
  const originTileY = toNumber(position?.tileY, 0);

  return {
    tileX: originTileX + Math.floor(ATTACK_SPACE_WIDTH_TILES / 2),
    tileY: originTileY + Math.floor(ATTACK_SPACE_HEIGHT_TILES / 2),
  };
}


function getAttackTravelVelocityBonus(player) {
  const combatBonus = toNumber(player?.combatModifiers?.velocityBonus, 0);
  const boosts = player?.activeBoosts || player?.boosts || {};
  const shopBonus = toNumber(
    boosts?.attackTravelVelocityBonus ?? boosts?.attackSpeedBonus ?? boosts?.convoySpeedBonus,
    0
  );

  // Limite anti-exploit: mesmo com aceleradores, nunca passa de 90% de redução.
  return Math.max(0, Math.min(0.9, combatBonus + shopBonus));
}

function sanitizeSelection(selection = {}) {
  const TYPES = ['capanga','frente','executor','assassino','muralha','certeiro','motorista','nitro'];
  return Object.fromEntries(
    TYPES.map((t) => [t, Math.max(0, Math.floor(toNumber(selection[t], 0)))])
  );
}

function hasAnySelection(selection) {
  return Object.values(selection || {}).some((v) => Number(v || 0) > 0);
}

function getMemberCountFromAttack(attack) {
  return Array.isArray(attack?.selectedMemberIds) ? attack.selectedMemberIds.length : 0;
}

function buildResponse(attack) {
  return {
    battleId:           attack.id,
    status:             attack.status,
    attackerId:         attack.attackerId,
    attackerName:       attack.attackerName,
    defenderId:         attack.targetId,
    defenderName:       attack.targetName,
    origin:             attack.origin || null,
    target:             attack.target || null,
    route: {
      fromTileX: toNumber(attack?.origin?.tileX, 0),
      fromTileY: toNumber(attack?.origin?.tileY, 0),
      toTileX:   toNumber(attack?.target?.tileX, 0),
      toTileY:   toNumber(attack?.target?.tileY, 0),
    },
    routeTiles: Array.isArray(attack.routeTiles) ? attack.routeTiles : [],
    routeDistanceTiles: attack.routeDistanceTiles,
    timePerTileMs:      attack.timePerTileMs,
    totalDurationMs:    attack.totalDurationMs,
    launchedAtIso:      attack.launchedAtIso,
    arriveAtIso:        attack.arriveAtIso,
    resolvedAtIso:      attack.resolvedAtIso || null,
    report:             attack.report || null,
    memberCount:        getMemberCountFromAttack(attack),
    attackerConvoySkinId: attack.attackerConvoySkinId || 'comboio_padrao',
    acceleratorUses: attack.acceleratorUses || 0,
  };
}

function buildResolvedPayload(attack, resolution = null) {
  const savedReport = attack.report || {};
  return {
    ...buildResponse(attack),
    resolution: resolution || savedReport.resolution || null,
    attacker: {
      playerId:    String(attack.attackerId),
      playerName:  String(attack.attackerName || ''),
      factionId:   attack.attackerFactionId || null,
      factionName: attack.attackerFactionName || '',
      factionTag:  attack.attackerFactionTag || '',
    },
    defender: {
      playerId:    String(attack.targetId),
      playerName:  String(attack.targetName || ''),
      factionId:   attack.defenderFactionId || null,
      factionName: attack.defenderFactionName || '',
      factionTag:  attack.defenderFactionTag || '',
    },
  };
}

function appendAttackHistory(player, item, limit = 50) {
  const next = Array.isArray(player.attackHistory) ? [...player.attackHistory] : [];
  next.unshift(item);
  player.attackHistory = next.slice(0, limit);
}

function emitPlayerAndGangUpdate(player) {
  const playerId = String(player?._id || '');
  if (!playerId) return;

  const plain = typeof player.toObject === 'function' ? player.toObject() : player;
  emitToPlayer(playerId, 'playerUpdate', { player: mergePlayerState(plain) });
  emitToPlayer(playerId, 'gangUpdate', { gang: plain.gang || { members: [], trainingSlots: [], stats: {} } });
}

function markGangModified(player) {
  if (typeof player?.markModified === 'function') {
    player.markModified('gang');
  }
}

function clearMarchingMembersForAttack(player, attackId) {
  if (!Array.isArray(player?.gang?.members)) return 0;

  let changed = 0;
  for (const member of player.gang.members) {
    if (String(member?.activeAttackId || '') === String(attackId)) {
      member.status = 'ativo';
      member.activeAttackId = null;
      member.marchingUntil = null;
      changed += 1;
    }
  }

  if (changed > 0) {
    markGangModified(player);
  }

  return changed;
}

async function rollbackMarchingMembers(attackerId, attackId) {
  try {
    const attacker = await Player.findById(String(attackerId));
    if (!attacker) return;

    const changed = clearMarchingMembersForAttack(attacker, attackId);
    if (changed > 0) {
      bumpVersion(attacker);
      await attacker.save();
      emitPlayerAndGangUpdate(attacker);
    }
  } catch (err) {
    console.error(`[ATTACK_ROLLBACK] Falha ao liberar tropas do ataque ${attackId}:`, err?.message || err);
  }
}

// ─── Email com retry ─────────────────────────────────────────────────────────

async function sendAttackMail({ senderName, recipientId, recipientName, subject, body, metadata, maxAttempts = 3 }) {
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await ChatMessage.create({
        channel:       'mail',
        senderId:      'system',
        senderName,
        recipientId:   String(recipientId),
        recipientName: String(recipientName),
        subject:       String(subject || ''),
        body:          String(body    || ''),
        read:          false,
        system:        true,
        messageType:   'text',
        metadata:      metadata && typeof metadata === 'object' ? metadata : {},
      });
      return { success: true, attempt: attempt + 1 };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
      }
    }
  }

  console.error(`[EMAIL] Falha após ${maxAttempts} tentativas para ${recipientName}:`, lastError?.message);
  return { success: false, error: lastError?.message };
}

// ═════════════════════════════════════════════════════════════════════════════
// VALIDAÇÕES MAFIA-CITY
// ═════════════════════════════════════════════════════════════════════════════

const COOLDOWN_DEFAULT_MS            = 24 * 60 * 60 * 1000;       // 24h
const SHIELD_NOVATO_MS               = 7  * 24 * 60 * 60 * 1000;  // 7 dias
const SHIELD_DERROTA_MS              = 8  * 60 * 60 * 1000;       // 8h
const SHIELD_DERROTA_TRIGGER_PERCENT = 0.30;                       // 30% baixas → escudo

function hasActiveShield(player) {
  const expires = Number(player?.shieldExpiresAt || 0);
  return expires > Date.now();
}

function getCooldownTimestamp(defender, attackerId) {
  const map = defender?.lastAttacksAgainst;
  if (!map) return 0;

  if (typeof map.get === 'function') {
    return Number(map.get(String(attackerId)) || 0);
  }

  return Number(map[String(attackerId)] || 0);
}

function setCooldownTimestamp(defender, attackerId, timestamp) {
  if (typeof defender.lastAttacksAgainst?.set === 'function') {
    defender.lastAttacksAgainst.set(String(attackerId), timestamp);
  } else {
    defender.lastAttacksAgainst = defender.lastAttacksAgainst || {};
    defender.lastAttacksAgainst[String(attackerId)] = timestamp;
    defender.markModified('lastAttacksAgainst');
  }
}

function getEffectiveCooldownMs(defender) {
  const multiplier = toNumber(defender?.combatModifiers?.cooldownMultiplier, 1);
  return COOLDOWN_DEFAULT_MS * Math.max(0.1, Math.min(1, multiplier));
}

function isInCooldown(defender, attackerId) {
  const lastAt = getCooldownTimestamp(defender, attackerId);
  if (!lastAt) return false;
  return (Date.now() - lastAt) < getEffectiveCooldownMs(defender);
}

function getCooldownExpiresAt(defender, attackerId) {
  const lastAt = getCooldownTimestamp(defender, attackerId);
  if (!lastAt) return 0;
  return lastAt + getEffectiveCooldownMs(defender);
}

function validateCanAttack(attacker, defender) {
  if (String(attacker._id) === String(defender._id)) {
    return {
      ok: false,
      status: 400,
      reason: 'self_attack',
      message: 'Você não pode atacar a si mesmo',
    };
  }

  if (attacker.factionId && defender.factionId && String(attacker.factionId) === String(defender.factionId)) {
    return {
      ok: false,
      status: 403,
      reason: 'same_faction',
      message: 'Você não pode atacar um membro da sua facção',
    };
  }

  if (hasActiveShield(defender)) {
    return {
      ok: false,
      status: 403,
      reason: 'shield_active',
      shieldExpiresAt: defender.shieldExpiresAt,
      shieldSource: defender.shieldSource || 'unknown',
      message: 'O alvo está protegido por um escudo ativo',
    };
  }

  if (isInCooldown(defender, attacker._id)) {
    const expires = getCooldownExpiresAt(defender, attacker._id);
    return {
      ok: false,
      status: 429,
      reason: 'cooldown',
      cooldownExpiresAt: expires,
      message: `Aguarde até ${new Date(expires).toLocaleString('pt-BR')} para reatacar esse alvo`,
    };
  }

  return { ok: true };
}

// ═════════════════════════════════════════════════════════════════════════════
// LÓGICA CORE DA BATALHA
// ═════════════════════════════════════════════════════════════════════════════

async function resolveAttackDocument(attack) {
  if (!attack) {
    return { ok: false, status: 404, error: 'Batalha não encontrada' };
  }

  if (attack.status === 'resolved') {
    return { ok: true, data: buildResolvedPayload(attack) };
  }

  if (attack.status === 'cancelled') {
    return { ok: false, status: 409, error: 'Batalha cancelada' };
  }

  if (attack.arriveAtIso && new Date(attack.arriveAtIso).getTime() > Date.now()) {
    const remainingMs = new Date(attack.arriveAtIso).getTime() - Date.now();
    return { ok: false, status: 409, error: 'A marcha ainda não chegou ao destino', remainingMs };
  }

  const attacker = await Player.findById(String(attack.attackerId));
  const defender = await Player.findById(String(attack.targetId));

  if (!attacker || !defender) {
    attack.status = 'cancelled';
    attack.resolvedAtIso = new Date().toISOString();
    await attack.save();
    return { ok: false, status: 404, error: 'Jogadores não encontrados (batalha cancelada)' };
  }

  const result = resolveAttackResult({
    battleId: String(attack.id),
    attacker: attacker.toObject(),
    defender: defender.toObject(),
    selection: Object.fromEntries(
      (Array.isArray(attack.selectedTroops) ? attack.selectedTroops : [])
        .map((item) => [item.type, item.quantity])
    ),
    selectedMemberIds: Array.isArray(attack.selectedMemberIds) ? attack.selectedMemberIds : [],
  });

  attacker.balances = attacker.balances || {};
  defender.balances = defender.balances || {};
  attacker.balances.dirtyMoney = result.nextDirtyMoneyAtacante;
  defender.balances.dirtyMoney = result.nextDirtyMoneyDefensor;

  attacker.gang = {
    ...(attacker.gang?.toObject?.() || attacker.gang || {}),
    ...result.nextAttackerGang,
    trainingSlots: attacker.gang?.trainingSlots || [],
  };

  defender.gang = {
    ...(defender.gang?.toObject?.() || defender.gang || {}),
    ...result.nextDefenderGang,
    trainingSlots: defender.gang?.trainingSlots || [],
  };

  attacker.gang.updatedAtIso = new Date().toISOString();
  defender.gang.updatedAtIso = new Date().toISOString();

  markGangModified(attacker);
  markGangModified(defender);

  bumpVersion(attacker);
  bumpVersion(defender);

  const historyItem = {
    id:           attack.id,
    attackerId:   attack.attackerId,
    attackerName: attack.attackerName,
    targetId:     attack.targetId,
    targetName:   attack.targetName,
    success:      result.success,
    loot:         result.lootDirtyMoney,
    createdAt:    new Date().toISOString(),
  };

  appendAttackHistory(attacker, historyItem);
  appendAttackHistory(defender, historyItem);

  const resolution = {
    success:       result.success,
    loot:          result.lootDirtyMoney + (result.spoils?.luxuryConvertedDirtyMoney || 0),
    chance:        Math.round(result.winChance * 100),
    attackerPower: result.attackerGangStats.totalPower,
    defenderPower: result.defenderGangStats.totalPower,
    message:       result.message,
    critical:      result.critical,
    spoils:        result.spoils,
    attackerGangLosses: result.attackerGangLosses,
    defenderGangLosses: result.defenderGangLosses,
    attackerGangStats:  result.attackerGangStats,
    defenderGangStats:  result.defenderGangStats,
  };

  const report = buildAttackReport(result);

  attack.status        = 'resolved';
  attack.success       = result.success;
  attack.critical      = result.critical;
  attack.loot          = result.lootDirtyMoney;
  attack.resolvedAtIso = new Date().toISOString();
  attack.report = {
    resolution,
    winner:               result.winner,
    rounds:               result.rounds,
    lootDirtyMoney:       result.lootDirtyMoney,
    barracoLevelPerdedor: result.barracoLevelPerdedor,
    attacker:             result.attacker,
    defender:             result.defender,
    attackerSubject:      report.attackerSubject,
    attackerBody:         report.attackerBody,
    defenderSubject:      report.defenderSubject,
    defenderBody:         report.defenderBody,
  };

  const defenderInitialComp = result.defender?.composicaoInicial || {};
  const defenderInitialCount = Object.values(defenderInitialComp).reduce((s, n) => s + Number(n || 0), 0);
  const defenderLossesCount  = Number(result.defender?.perdas || 0) + Number(result.defender?.machucados || 0);
  const lossPercent = defenderInitialCount > 0 ? defenderLossesCount / defenderInitialCount : 0;

  if (result.winner === 'atacante' && lossPercent >= SHIELD_DERROTA_TRIGGER_PERCENT) {
    defender.shieldExpiresAt = Date.now() + SHIELD_DERROTA_MS;
    defender.shieldSource    = 'derrota';
  }

  await Promise.all([attacker.save(), defender.save(), attack.save()]);

  emitPlayerAndGangUpdate(attacker);
  emitPlayerAndGangUpdate(defender);

  emitToPlayer(String(defender._id), 'attackReceived', {
    attackerName: String(attacker.name || 'Desconhecido'),
    loot:         result.success ? result.lootDirtyMoney : 0,
    critical:     result.critical,
    message:      result.success
      ? `${attacker.name} invadiu seu território e roubou R$ ${result.lootDirtyMoney.toLocaleString('pt-BR')}`
      : `${attacker.name} tentou invadir mas sua defesa resistiu!`,
  });

  // ────────────────────────────────────────────────────────────────────────
  // BROADCAST GLOBAL: squad inicia retorno para a posição ATUALIZADA
  // do atacante. Todos os clientes assinantes podem animar a viagem de
  // volta. O atacante é excluído porque já controla a animação localmente
  // (useMapAttack.confirmAttack chama mountGangSquadAnimation para o
  // retorno após receber a resolução).
  // ────────────────────────────────────────────────────────────────────────
  try {
    const updatedAttackerOrigin = getAttackCenterFromMapPosition(attacker.mapPosition || {});
    const velocityBonus = getAttackTravelVelocityBonus(attacker);
    const returnTravel  = buildTravelMetrics({
      origin:       attack.target,        // squad parte do alvo
      target:       updatedAttackerOrigin, // chega no centro ATUAL do atacante
      barracoLevel: attacker?.niveis?.barracoLevel || 1,
      velocityBonus,
    });

    const returnLaunchIso = new Date().toISOString();
    const returnArriveIso = new Date(
      Date.now() + returnTravel.totalDurationMs
    ).toISOString();

    broadcastToAll('attack:squadResolved', {
      battleId:             attack.id,
      attackerId:           String(attack.attackerId),
      attackerName:         String(attack.attackerName || ''),
      attackerConvoySkinId: attack.attackerConvoySkinId || 'comboio_padrao',
    acceleratorUses: attack.acceleratorUses || 0,
      memberCount:          getMemberCountFromAttack(attack),

      // Onde o squad estava (centro do alvo)
      returnOrigin: {
        tileX: toNumber(attack?.target?.tileX, 0),
        tileY: toNumber(attack?.target?.tileY, 0),
      },
      // Para onde o squad volta (centro ATUAL do barraco do atacante)
      returnTarget: {
        tileX: updatedAttackerOrigin.tileX,
        tileY: updatedAttackerOrigin.tileY,
      },

      returnRouteTiles:          returnTravel.routeTiles,
      returnRouteDistanceTiles: returnTravel.routeDistanceTiles,
      returnTimePerTileMs:      returnTravel.timePerTileMs,
      returnTotalDurationMs:    returnTravel.totalDurationMs,
      returnLaunchedAtIso:      returnLaunchIso,
      returnArriveAtIso:        returnArriveIso,

      resolution: {
        success:  result.success,
        critical: result.critical,
      },
    }, String(attack.attackerId)); // ← exclui o atacante do broadcast
  } catch (broadcastErr) {
    console.error(`[ATTACK_RESOLVED_BROADCAST] Falha ao broadcastar retorno de ${attack.id}:`, broadcastErr?.message);
  }

  const [atkMail, defMail] = await Promise.allSettled([
    sendAttackMail({
      senderName:    'Sistema',
      recipientId:   attacker._id,
      recipientName: attacker.name,
      subject:       report.attackerSubject,
      body:          report.attackerBody,
      metadata:      { type: 'attack_report', attackId: attack.id, role: 'attacker' },
    }),
    sendAttackMail({
      senderName:    'Sistema',
      recipientId:   defender._id,
      recipientName: defender.name,
      subject:       report.defenderSubject,
      body:          report.defenderBody,
      metadata:      { type: 'attack_report', attackId: attack.id, role: 'defender' },
    }),
  ]);

  const attackerMailFailed =
    atkMail.status === 'rejected' ||
    (atkMail.status === 'fulfilled' && atkMail.value?.success !== true);

  const defenderMailFailed =
    defMail.status === 'rejected' ||
    (defMail.status === 'fulfilled' && defMail.value?.success !== true);

  const mailErrors = [
    attackerMailFailed ? 'attacker' : null,
    defenderMailFailed ? 'defender' : null,
  ].filter(Boolean);

  attack.mailStatus = {
    sentToAttacker: !attackerMailFailed,
    sentToDefensor: !defenderMailFailed,
    errors:         mailErrors,
    retriedAt:      new Date().toISOString(),
  };
  await attack.save();

  console.log(`[RESOLVE] Batalha finalizada: ${attack.id} | ${result.winner} | loot: ${result.lootDirtyMoney}`);

  const responseData = buildResolvedPayload(attack, resolution);

  if (mailErrors.length > 0) {
    responseData.warning = `E-mail não enviado para: ${mailErrors.join(', ')}`;
  }

  return { ok: true, data: responseData };
}

async function autoResolveDueBattlesForPlayer(playerId) {
  const requesterId = String(playerId || '');
  if (!requesterId) return [];

  const dueAttacks = await Attack.find({
    status: 'travelling',
    arriveAtIso: { $lte: new Date().toISOString() },
    $or: [{ attackerId: requesterId }, { targetId: requesterId }],
  });

  const results = [];
  for (const attack of dueAttacks) {
    try {
      results.push(await resolveAttackDocument(attack));
    } catch (err) {
      console.error(`[AUTO-RESOLVE] Erro ao resolver batalha pendente ${attack.id}:`, err?.message || err);
    }
  }

  return results;
}

// ═════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /battle/estimate
 * Estima o resultado sem criar batalha.
 */
export async function estimateBattle(req, res) {
  try {
    const attacker = req.player;
    const { targetId, selection = {}, selectedMemberIds = [] } = req.body || {};

    if (!targetId) return res.status(400).json({ error: 'targetId é obrigatório' });

    const defender = await Player.findById(String(targetId));
    if (!defender)  return res.status(404).json({ error: 'Defensor não encontrado' });

    if (String(attacker._id) === String(defender._id)) {
      return res.status(400).json({ error: 'Você não pode atacar a si mesmo' });
    }

    const safeSelection = sanitizeSelection(selection);
    if (!hasAnySelection(safeSelection) && !selectedMemberIds.length) {
      return res.status(400).json({ error: 'Seleção de ataque vazia' });
    }

    const result = resolveAttackResult({
      attacker:          attacker.toObject(),
      defender:          defender.toObject(),
      selection:         safeSelection,
      selectedMemberIds,
    });

    return res.json({
      estimatedLoot:       result.lootDirtyMoney,
      estimatedChance:     Math.round(result.winChance * 100),
      attackerPower:       result.attackerGangStats.totalPower,
      defenderPower:       result.defenderGangStats.totalPower,
      correCost:           10,
      attackerGangPower:   result.attackerGangStats.totalPower,
      defenderGangPower:   result.defenderGangStats.totalPower,
      estimatedWinner:     result.winner,
      estimatedRounds:     result.rounds,
      attacker:            result.attacker,
      defender:            result.defender,
    });
  } catch (err) {
    console.error('[ESTIMATE]', err);
    return res.status(500).json({ error: 'Erro ao estimar batalha' });
  }
}

/**
 * POST /battle/start
 * Cria ataque persistente, bloqueia tropas em marcha e avisa o defensor.
 * Também broadcasta o início da marcha para TODOS os clientes conectados,
 * permitindo que defensores e observadores vejam o squad em tempo real.
 */
export async function startBattle(req, res) {
  let attackId = null;
  let attackerIdForRollback = null;

  try {
    const requesterId = getRequesterId(req);
    if (!requesterId) return res.status(401).json({ error: 'Usuário não autenticado' });

    const {
      targetId,
      selection = {},
      selectedMemberIds = [],
      convoySkinId,
    } = req.body || {};

    if (!targetId) return res.status(400).json({ error: 'targetId é obrigatório' });

    const attacker = await Player.findById(requesterId);
    if (!attacker) return res.status(401).json({ error: 'Atacante não encontrado' });

    const defender = await Player.findById(String(targetId));
    if (!defender)  return res.status(404).json({ error: 'Defensor não encontrado' });

    attackerIdForRollback = String(attacker._id);

    const validation = validateCanAttack(attacker, defender);
    if (!validation.ok) {
      return res.status(validation.status).json({
        error: validation.message,
        reason: validation.reason,
        shieldExpiresAt: validation.shieldExpiresAt,
        shieldSource: validation.shieldSource,
        cooldownExpiresAt: validation.cooldownExpiresAt,
      });
    }

    const safeSelection = sanitizeSelection(selection);
    if (!hasAnySelection(safeSelection) && !selectedMemberIds.length) {
      return res.status(400).json({ error: 'Seleção de ataque vazia' });
    }

    let safeConvoySkinId = 'comboio_padrao';
    try {
      safeConvoySkinId = requireOwnedConvoy(attacker, convoySkinId || 'comboio_padrao').id;
    } catch (convoyError) {
      return res.status(convoyError.status || 403).json({
        error: convoyError.message || 'Comboio não autorizado',
        reason: convoyError.reason || 'convoy_not_allowed',
        skinId: convoyError.skinId,
      });
    }

    const resolvedMemberIds = resolveSelectedMemberIdsForAttack({
      attacker:          attacker.toObject(),
      selection:         safeSelection,
      selectedMemberIds,
    });

    if (!resolvedMemberIds.length) {
      return res.status(400).json({ error: 'Nenhum membro ativo disponível para o ataque' });
    }

    const availableIds = new Set(
      (Array.isArray(attacker.gang?.members) ? attacker.gang.members : [])
        .filter((member) => member.status === 'ativo')
        .map((member) => String(member.id))
    );

    const unavailable = resolvedMemberIds.some((id) => !availableIds.has(String(id)));
    if (unavailable) {
      return res.status(409).json({ error: 'Algumas tropas não estão mais disponíveis para ataque' });
    }

    attackId = randomUUID();

    const origin = getAttackCenterFromMapPosition(attacker?.mapPosition);
    const target = getAttackCenterFromMapPosition(defender?.mapPosition);
    const velocityBonus = getAttackTravelVelocityBonus(attacker);
    const travel = buildTravelMetrics({
      origin,
      target,
      barracoLevel: attacker?.niveis?.barracoLevel || 1,
      velocityBonus,
    });
    const launchedAt = new Date();
    const arriveAt   = new Date(launchedAt.getTime() + travel.totalDurationMs);
    const launchedAtIso = launchedAt.toISOString();
    const arriveAtIso   = arriveAt.toISOString();

    const resolvedMemberIdSet = new Set(resolvedMemberIds.map(String));
    for (const member of attacker.gang?.members || []) {
      if (resolvedMemberIdSet.has(String(member.id))) {
        member.status = 'marchando';
        member.activeAttackId = attackId;
        member.marchingUntil = arriveAtIso;
      }
    }

    markGangModified(attacker);
    bumpVersion(attacker);
    await attacker.save();
    emitPlayerAndGangUpdate(attacker);

    let attack;
    try {
      attack = await Attack.create({
        id:                attackId,
        status:            'travelling',
        attackerId:        String(attacker._id),
        attackerName:      String(attacker.name || 'Atacante'),
        targetId:          String(defender._id),
        targetName:        String(defender.name || 'Defensor'),
        attackerFactionId: attacker.factionId  || null,
        defenderFactionId: defender.factionId  || null,
        attackerConvoySkinId: safeConvoySkinId,
        origin,
        target,
        routeTiles: travel.routeTiles,
        routeDistanceTiles: travel.routeDistanceTiles,
        timePerTileMs:      travel.timePerTileMs,
        totalDurationMs:    travel.totalDurationMs,
        launchedAtIso,
        arriveAtIso,
        selectedTroops:     Object.entries(safeSelection)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([type, quantity]) => ({ type, quantity })),
        selectedMemberIds: resolvedMemberIds,
      });
    } catch (createErr) {
      await rollbackMarchingMembers(attacker._id, attackId);
      throw createErr;
    }

    setCooldownTimestamp(defender, attacker._id, Date.now());
    try {
      await defender.save();
    } catch (cooldownErr) {
      console.error(`[ATTACK] Ataque ${attack.id} criado, mas cooldown do defensor não salvou:`, cooldownErr?.message || cooldownErr);
    }

    console.log(`[ATTACK] Iniciado: ${attack.attackerName} → ${attack.targetName} (${resolvedMemberIds.length} membros)`);

    // ── Toast textual para o defensor ─────────────────────────────────────
    emitToPlayer(String(defender._id), 'attackIncoming', {
      attackerName:    String(attacker.name || 'Desconhecido'),
      attackerFaction: attacker.factionId || null,
      memberCount:     resolvedMemberIds.length,
      arriveAtIso,
      totalDurationMs: travel.totalDurationMs,
      route: {
        fromTileX: origin.tileX,
        fromTileY: origin.tileY,
        toTileX:   target.tileX,
        toTileY:   target.tileY,
      },
      routeTiles: travel.routeTiles,
      attackerConvoySkinId: safeConvoySkinId,
      message: `${attacker.name} está marchando para o seu território`,
    });

    // ────────────────────────────────────────────────────────────────────────
    // BROADCAST GLOBAL: marcha do squad visível no mapa para todos os
    // clientes conectados (defensor + observadores). O atacante é excluído
    // porque já anima o squad localmente via useMapAttack.confirmAttack.
    // ────────────────────────────────────────────────────────────────────────
    try {
      broadcastToAll('attack:squadStarted', {
        battleId:             attack.id,
        attackerId:           String(attacker._id),
        attackerName:         String(attacker.name || ''),
        defenderId:           String(defender._id),
        defenderName:         String(defender.name || ''),
        attackerConvoySkinId: safeConvoySkinId,
        memberCount:          resolvedMemberIds.length,
        origin:               { tileX: origin.tileX, tileY: origin.tileY },
        target:               { tileX: target.tileX, tileY: target.tileY },
        route: {
          fromTileX: origin.tileX,
          fromTileY: origin.tileY,
          toTileX:   target.tileX,
          toTileY:   target.tileY,
        },
        routeTiles: travel.routeTiles,
        routeDistanceTiles: travel.routeDistanceTiles,
        timePerTileMs:      travel.timePerTileMs,
        totalDurationMs:    travel.totalDurationMs,
        launchedAtIso,
        arriveAtIso,
        barracoLevel:       attacker?.niveis?.barracoLevel || 1,
      }, String(attacker._id)); // ← exclui o atacante
    } catch (broadcastErr) {
      console.error(`[ATTACK_STARTED_BROADCAST] Falha ao broadcastar marcha de ${attack.id}:`, broadcastErr?.message);
    }

    return res.status(201).json({
      success: true,
      ...buildResponse(attack),
    });
  } catch (err) {
    console.error('[START_BATTLE]', err);
    return res.status(500).json({ error: 'Erro ao iniciar batalha' });
  }
}

/**
 * POST /battle/resolve/:battleId
 * Atacante ou defensor podem disparar a resolução depois da chegada.
 */
export async function resolveBattle(req, res) {
  try {
    const requesterId = getRequesterId(req);
    if (!requesterId) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { battleId } = req.params;
    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) return res.status(404).json({ error: 'Batalha não encontrada' });

    const involved = String(attack.attackerId) === requesterId || String(attack.targetId) === requesterId;
    if (!involved) {
      return res.status(403).json({ error: 'Você não tem permissão para resolver esta batalha' });
    }

    const result = await resolveAttackDocument(attack);
    if (!result.ok) {
      return res.status(result.status || 500).json({
        error: result.error || 'Erro ao resolver batalha',
        remainingMs: result.remainingMs,
      });
    }

    return res.json(result.data);
  } catch (err) {
    console.error('[RESOLVE]', err);
    return res.status(500).json({ error: 'Erro ao resolver batalha', message: err.message });
  }
}

/**
 * GET /battle/report/:battleId
 * Retorna relatório e resolve automaticamente se a marcha já chegou.
 */
export async function getBattleReport(req, res) {
  try {
    const requesterId = getRequesterId(req);
    if (!requesterId) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { battleId } = req.params;
    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) return res.status(404).json({ error: 'Batalha não encontrada' });

    const allowed = String(attack.attackerId) === requesterId || String(attack.targetId) === requesterId;
    if (!allowed) return res.status(403).json({ error: 'Acesso negado' });

    if (attack.status === 'travelling' && new Date(attack.arriveAtIso || 0).getTime() <= Date.now()) {
      const result = await resolveAttackDocument(attack);
      if (result.ok) return res.json(result.data);
    }

    return res.json(buildResolvedPayload(attack));
  } catch (err) {
    console.error('[REPORT]', err);
    return res.status(500).json({ error: 'Erro ao buscar relatório' });
  }
}

/**
 * GET /battle/history
 * Histórico de batalhas do jogador autenticado. Resolve pendentes vencidas antes.
 */
export async function getBattleHistory(req, res) {
  try {
    const requesterId = getRequesterId(req);
    if (!requesterId) return res.status(401).json({ error: 'Usuário não autenticado' });

    await autoResolveDueBattlesForPlayer(requesterId);

    const attacks = await Attack.find({
      $or: [{ attackerId: requesterId }, { targetId: requesterId }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json(attacks.map((attack) => buildResolvedPayload(attack)));
  } catch (err) {
    console.error('[HISTORY]', err);
    return res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
}

/**
 * GET /battle/active
 * Ataques travelling envolvendo o jogador. Também resolve os que já venceram.
 */
export async function getActiveBattles(req, res) {
  try {
    const requesterId = getRequesterId(req);
    if (!requesterId) return res.status(401).json({ error: 'Usuário não autenticado' });

    await autoResolveDueBattlesForPlayer(requesterId);

    const attacks = await Attack.find({
      status: 'travelling',
      $or: [{ attackerId: requesterId }, { targetId: requesterId }],
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(attacks.map((attack) => {
      const role = String(attack.attackerId) === requesterId ? 'attacker' : 'defender';
      const arriveAtMs = new Date(attack.arriveAtIso || 0).getTime();
      const remainingMs = Math.max(0, arriveAtMs - Date.now());
      const memberCount = Array.isArray(attack.selectedMemberIds) ? attack.selectedMemberIds.length : 0;

      return {
        battleId:           attack.id,
        status:             attack.status,
        role,
        attackerId:         attack.attackerId,
        attackerName:       attack.attackerName,
        defenderId:         attack.targetId,
        defenderName:       attack.targetName,
        targetId:           attack.targetId,
        targetName:         attack.targetName,
        origin:             attack.origin || null,
        target:             attack.target || null,
        route: {
          fromTileX: toNumber(attack?.origin?.tileX, 0),
          fromTileY: toNumber(attack?.origin?.tileY, 0),
          toTileX:   toNumber(attack?.target?.tileX, 0),
          toTileY:   toNumber(attack?.target?.tileY, 0),
        },
        launchedAtIso:      attack.launchedAtIso,
        arriveAtIso:        attack.arriveAtIso,
        remainingMs,
        totalDurationMs:    attack.totalDurationMs,
        timePerTileMs:      attack.timePerTileMs,
        routeTiles: Array.isArray(attack.routeTiles) ? attack.routeTiles : [],
        routeDistanceTiles: attack.routeDistanceTiles,
        memberCount,
        attackerConvoySkinId: attack.attackerConvoySkinId || 'comboio_padrao',
    acceleratorUses: attack.acceleratorUses || 0,
      };
    }));
  } catch (err) {
    console.error('[ACTIVE_BATTLES]', err);
    return res.status(500).json({ error: 'Erro ao buscar batalhas ativas' });
  }
}

/**
 * GET /battle/can-attack/:targetId
 */
export async function canAttack(req, res) {
  try {
    const attacker = req.player;
    const { targetId } = req.params;

    if (!targetId) {
      return res.status(400).json({ canAttack: false, reason: 'no_target' });
    }

    const defender = await Player.findById(String(targetId));
    if (!defender) {
      return res.status(404).json({ canAttack: false, reason: 'target_not_found' });
    }

    const validation = validateCanAttack(attacker, defender);

    return res.json({
      canAttack:          validation.ok,
      reason:             validation.reason ?? null,
      message:            validation.message ?? null,
      shieldExpiresAt:    validation.shieldExpiresAt ?? null,
      shieldSource:       validation.shieldSource ?? null,
      cooldownExpiresAt:  validation.cooldownExpiresAt ?? null,
    });
  } catch (err) {
    console.error('[CAN_ATTACK]', err);
    return res.status(500).json({ canAttack: false, reason: 'server_error' });
  }
}

// Alias de compatibilidade
export async function initiateAttack(req, res) {
  return startBattle(req, res);
}
