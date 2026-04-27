// controllers/attackController.js

import { randomUUID } from 'crypto';
import Attack      from '../models/Attack.js';
import Player      from '../models/Player.js';
import ChatMessage from '../models/ChatMessage.js';
import { bumpVersion }     from '../utils/gameHelpers.js';
import { emitToPlayer }    from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import {
  buildTravelMetrics,
  resolveAttackResult,
  resolveSelectedMemberIdsForAttack,
} from '../services/attack/resolveAttack.js';
import { buildAttackReport } from '../services/attack/buildAttackReport.js';

// ═════════════════════════════════════════════════════════════════════════════
// UTILS
// ═════════════════════════════════════════════════════════════════════════════

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

function buildResponse(attack) {
  return {
    battleId:           attack.id,
    status:             attack.status,
    attackerId:         attack.attackerId,
    attackerName:       attack.attackerName,
    defenderId:         attack.targetId,
    defenderName:       attack.targetName,
    routeDistanceTiles: attack.routeDistanceTiles,
    timePerTileMs:      attack.timePerTileMs,
    totalDurationMs:    attack.totalDurationMs,
    launchedAtIso:      attack.launchedAtIso,
    arriveAtIso:        attack.arriveAtIso,
    report:             attack.report || null,
  };
}

function appendAttackHistory(player, item, limit = 50) {
  const next = Array.isArray(player.attackHistory) ? [...player.attackHistory] : [];
  next.unshift(item);
  player.attackHistory = next.slice(0, limit);
}

function updateMemberStatusAfterBattle(members = [], deadIds = new Set(), injuredIds = new Set()) {
  if (!Array.isArray(members)) return members;
  const now          = Date.now();
  const recoveryMs   = 3_600_000; // 1h

  for (const m of members) {
    if (!m?.id) continue;
    if (deadIds.has(String(m.id))) {
      m.status      = 'morto';
      m.injuryEndsAt = null;
    } else if (injuredIds.has(String(m.id))) {
      m.status      = 'ferido';
      m.injuryEndsAt = new Date(now + recoveryMs).toISOString();
    } else if (m.status === 'ferido') {
      const end = m.injuryEndsAt ? new Date(m.injuryEndsAt).getTime() : 0;
      if (end <= now) { m.status = 'ativo'; m.injuryEndsAt = null; }
    }
  }
  return members;
}

// ─── Email com retry ─────────────────────────────────────────────────────────

async function sendAttackMail({ senderName, recipientId, recipientName, subject, body, metadata, maxAttempts = 3 }) {
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await ChatMessage.create({
        channel:      'mail',
        senderId:     'system',
        senderName,
        recipientId:  String(recipientId),
        recipientName: String(recipientName),
        subject:      String(subject || ''),
        body:         String(body    || ''),
        read:         false,
        system:       true,
        messageType:  'text',
        metadata:     metadata && typeof metadata === 'object' ? metadata : {},
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
// ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /battle/estimate
 * Estima o resultado sem criar batalha.
 * Retorna os campos que o frontend espera: estimatedLoot, estimatedChance, attackerPower, defenderPower.
 */
export async function estimateBattle(req, res) {
  try {
    const attacker = req.player;
    const { targetId, selection = {}, selectedMemberIds = [] } = req.body || {};

    if (!targetId) return res.status(400).json({ error: 'targetId é obrigatório' });

    const defender = await Player.findById(String(targetId));
    if (!defender)  return res.status(404).json({ error: 'Defensor não encontrado' });

    if (String(attacker._id) === String(defender._id))
      return res.status(400).json({ error: 'Você não pode atacar a si mesmo' });

    const safeSelection = sanitizeSelection(selection);
    if (!hasAnySelection(safeSelection) && !selectedMemberIds.length)
      return res.status(400).json({ error: 'Seleção de ataque vazia' });

    const result = resolveAttackResult({
      attacker:          attacker.toObject(),
      defender:          defender.toObject(),
      selection:         safeSelection,
      selectedMemberIds,
    });

    // ── Resposta no shape que o frontend (attackApi.ts) espera ─────────────
    return res.json({
      // Frontend shape (attackApi.ts EstimateBattleResponse)
      estimatedLoot:       result.lootDirtyMoney,
      estimatedChance:     Math.round(result.winChance * 100), // 0–100
      attackerPower:       result.attackerGangStats.totalPower,
      defenderPower:       result.defenderGangStats.totalPower,
      correCost:           10,
      attackerGangPower:   result.attackerGangStats.totalPower,
      defenderGangPower:   result.defenderGangStats.totalPower,
      // Campos extras para debug/display
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
 * Inicia batalha, cria registro, emite 'attackReceived' ao defensor via socket.
 */
export async function startBattle(req, res) {
  try {
    const attacker = req.player;
    const {
      targetId, targetName,
      targetTileX, targetTileY,
      originTileX, originTileY,
      selection = {},
      selectedMemberIds = [],
    } = req.body || {};

    if (!targetId) return res.status(400).json({ error: 'targetId é obrigatório' });

    const defender = await Player.findById(String(targetId));
    if (!defender)  return res.status(404).json({ error: 'Defensor não encontrado' });

    if (String(attacker._id) === String(defender._id))
      return res.status(400).json({ error: 'Você não pode atacar a si mesmo' });

    const safeSelection = sanitizeSelection(selection);
    if (!hasAnySelection(safeSelection) && !selectedMemberIds.length)
      return res.status(400).json({ error: 'Seleção de ataque vazia' });

    const resolvedMemberIds = resolveSelectedMemberIdsForAttack({
      attacker:          attacker.toObject(),
      selection:         safeSelection,
      selectedMemberIds,
    });

    if (!resolvedMemberIds.length)
      return res.status(400).json({ error: 'Nenhum membro ativo disponível para o ataque' });

    const origin = {
      tileX: Number.isFinite(Number(originTileX)) ? Number(originTileX) : Number(attacker?.mapPosition?.tileX || 0),
      tileY: Number.isFinite(Number(originTileY)) ? Number(originTileY) : Number(attacker?.mapPosition?.tileY || 0),
    };
    const target = {
      tileX: Number.isFinite(Number(targetTileX)) ? Number(targetTileX) : Number(defender?.mapPosition?.tileX || 0),
      tileY: Number.isFinite(Number(targetTileY)) ? Number(targetTileY) : Number(defender?.mapPosition?.tileY || 0),
    };

    const travel     = buildTravelMetrics({ origin, target, barracoLevel: attacker?.niveis?.barracoLevel || 1 });
    const launchedAt = new Date();
    const arriveAt   = new Date(launchedAt.getTime() + travel.totalDurationMs);

    const attack = await Attack.create({
      id:                randomUUID(),
      status:            'travelling',
      attackerId:        String(attacker._id),
      attackerName:      String(attacker.name || 'Atacante'),
      targetId:          String(defender._id),
      targetName:        String(targetName || defender.name || 'Defensor'),
      attackerFactionId: attacker.factionId  || null,
      defenderFactionId: defender.factionId  || null,
      origin,
      target,
      routeDistanceTiles: travel.routeDistanceTiles,
      timePerTileMs:      travel.timePerTileMs,
      totalDurationMs:    travel.totalDurationMs,
      launchedAtIso:      launchedAt.toISOString(),
      arriveAtIso:        arriveAt.toISOString(),
      selectedTroops:     Object.entries(safeSelection)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([type, quantity]) => ({ type, quantity })),
      selectedMemberIds: resolvedMemberIds,
    });

    console.log(`[ATTACK] Iniciado: ${attack.attackerName} → ${attack.targetName} (${resolvedMemberIds.length} membros)`);

    // ── Notifica defensor via socket (evento 'attackReceived') ─────────────
    // Frontend: AttackIncomingToast.tsx escuta este evento.
    emitToPlayer(String(defender._id), 'attackReceived', {
      attackerName: String(attacker.name || 'Desconhecido'),
      loot:         null,   // ainda não calculado — será no resolve
      critical:     false,
      message:      `${attacker.name} está marchando para o seu território`,
    });

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
 * Resolve a batalha, aplica resultados, salva, envia e-mails e emite updates via socket.
 * Inclui campo 'resolution' com o shape exato que o frontend (attackApi.ts) normaliza.
 */
export async function resolveBattle(req, res) {
  try {
    const requesterId = String(req.user.id);
    const { battleId } = req.params;

    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) return res.status(404).json({ error: 'Batalha não encontrada' });

    if (String(attack.attackerId) !== requesterId)
      return res.status(403).json({ error: 'Somente o atacante pode resolver esta batalha' });

    if (attack.status === 'resolved') {
      // Batalha já resolvida — reconstrói resolution a partir do report salvo
      const savedReport = attack.report || {};
      return res.json({
        ...buildResponse(attack),
        resolution: savedReport.resolution || null,
        attacker: {
          playerId:   String(attack.attackerId),
          playerName: String(attack.attackerName),
          factionId:  attack.attackerFactionId || null,
        },
        defender: {
          playerId:   String(attack.targetId),
          playerName: String(attack.targetName),
          factionId:  attack.defenderFactionId || null,
        },
      });
    }

    // Verifica se a marcha chegou
    if (attack.arriveAtIso && new Date(attack.arriveAtIso).getTime() > Date.now()) {
      const remainingMs = new Date(attack.arriveAtIso).getTime() - Date.now();
      return res.status(409).json({ error: 'A marcha ainda não chegou ao destino', remainingMs });
    }

    const attacker = await Player.findById(String(attack.attackerId));
    const defender = await Player.findById(String(attack.targetId));
    if (!attacker || !defender) return res.status(404).json({ error: 'Jogadores não encontrados' });

    // ── Calcular resultado ────────────────────────────────────────────────
    const result = resolveAttackResult({
      attacker: attacker.toObject(),
      defender: defender.toObject(),
      selection: Object.fromEntries(
        (Array.isArray(attack.selectedTroops) ? attack.selectedTroops : [])
          .map((item) => [item.type, item.quantity])
      ),
      selectedMemberIds: Array.isArray(attack.selectedMemberIds) ? attack.selectedMemberIds : [],
    });

    // ── Atualizar saldos ──────────────────────────────────────────────────
    attacker.balances.dirtyMoney = result.nextDirtyMoneyAtacante;
    defender.balances.dirtyMoney = result.nextDirtyMoneyDefensor;

    // ── Atualizar gang do atacante ────────────────────────────────────────
    attacker.gang = result.nextAttackerGang;
    if (attacker.gang?.members) {
      attacker.gang.members = updateMemberStatusAfterBattle(
        attacker.gang.members,
        new Set(result.attackerDeadMemberIds    || []),
        new Set(result.attackerInjuredMemberIds || [])
      );
    }

    // ── Atualizar gang do defensor ────────────────────────────────────────
    defender.gang = result.nextDefenderGang;
    if (defender.gang?.members) {
      defender.gang.members = updateMemberStatusAfterBattle(
        defender.gang.members,
        new Set(result.defenderDeadMemberIds    || []),
        new Set(result.defenderInjuredMemberIds || [])
      );
    }

    if (attacker.gang) attacker.gang.updatedAtIso = new Date().toISOString();
    if (defender.gang) defender.gang.updatedAtIso = new Date().toISOString();

    bumpVersion(attacker);
    bumpVersion(defender);

    // ── Histórico ─────────────────────────────────────────────────────────
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

    // ── Montar o objeto 'resolution' no shape que o frontend espera ────────
    // Referência: attackApi.ts → normalizeResolution()
    const resolution = {
      success:       result.success,
      loot:          result.lootDirtyMoney + (result.spoils?.luxuryConvertedDirtyMoney || 0),
      chance:        Math.round(result.winChance * 100), // frontend divide por 100 se > 1
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

    // ── Construir relatório de e-mail ─────────────────────────────────────
    const report = buildAttackReport(result);

    // ── Salvar attack ─────────────────────────────────────────────────────
    attack.status       = 'resolved';
    attack.success      = result.success;
    attack.critical     = result.critical;
    attack.loot         = result.lootDirtyMoney;
    attack.resolvedAtIso = new Date().toISOString();
    attack.report = {
      resolution, // salva o objeto resolution para reutilizar em getBattleReport
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

    // ── Salvar tudo ────────────────────────────────────────────────────────
    await Promise.all([attacker.save(), defender.save(), attack.save()]);

    // ── Emitir playerUpdate para ambos ────────────────────────────────────
    emitToPlayer(String(attacker._id), 'playerUpdate', { player: mergePlayerState(attacker.toObject()) });
    emitToPlayer(String(defender._id), 'playerUpdate', { player: mergePlayerState(defender.toObject()) });

    // ── Emitir resultado ao defensor via socket ───────────────────────────
    // O AttackIncomingToast já notificou a chegada; agora notifica o resultado.
    emitToPlayer(String(defender._id), 'attackReceived', {
      attackerName: String(attacker.name || 'Desconhecido'),
      loot:         result.success ? result.lootDirtyMoney : 0,
      critical:     result.critical,
      message:      result.success
        ? `${attacker.name} invadiu seu território e roubou R$ ${result.lootDirtyMoney.toLocaleString('pt-BR')}`
        : `${attacker.name} tentou invadir mas sua defesa resistiu!`,
    });

    // ── Enviar e-mails ────────────────────────────────────────────────────
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

    const mailErrors = [
      atkMail.status === 'rejected' ? 'attacker' : null,
      defMail.status === 'rejected' ? 'defender' : null,
    ].filter(Boolean);

    attack.mailStatus = {
      sentToAttacker: atkMail.status === 'fulfilled' && atkMail.value?.success === true,
      sentToDefensor: defMail.status === 'fulfilled' && defMail.value?.success === true,
      errors:         mailErrors,
      retriedAt:      new Date().toISOString(),
    };
    await attack.save();

    console.log(`[RESOLVE] Batalha finalizada: ${battleId} | ${result.winner} | loot: ${result.lootDirtyMoney}`);

    // ── Resposta no shape que o frontend (attackApi.ts) normalizeReportResponse() espera ──
    const responseData = {
      ...buildResponse(attack),
      // ← 'resolution' é o campo que normalizeReportResponse extrai
      resolution,
      attacker: {
        playerId:    String(attacker._id),
        playerName:  String(attacker.name || ''),
        factionId:   attacker.factionId  || null,
        factionName: '',
        factionTag:  '',
      },
      defender: {
        playerId:    String(defender._id),
        playerName:  String(defender.name || ''),
        factionId:   defender.factionId  || null,
        factionName: '',
        factionTag:  '',
      },
    };

    if (mailErrors.length > 0) {
      responseData.warning = `E-mail não enviado para: ${mailErrors.join(', ')}`;
    }

    return res.json(responseData);
  } catch (err) {
    console.error('[RESOLVE]', err);
    return res.status(500).json({ error: 'Erro ao resolver batalha', message: err.message });
  }
}

/**
 * GET /battle/report/:battleId
 * Retorna relatório de batalha já resolvida.
 */
export async function getBattleReport(req, res) {
  try {
    const requesterId = String(req.user.id);
    const { battleId } = req.params;

    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) return res.status(404).json({ error: 'Batalha não encontrada' });

    const allowed = String(attack.attackerId) === requesterId || String(attack.targetId) === requesterId;
    if (!allowed) return res.status(403).json({ error: 'Acesso negado' });

    return res.json({
      ...buildResponse(attack),
      resolution: attack.report?.resolution || null,
      attacker: {
 