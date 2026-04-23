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

async function sendAttackMail({
  senderName,
  recipientId,
  recipientName,
  subject,
  body,
  metadata,
}) {
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
}

function appendAttackHistory(player, item, limit = 50) {
  const next = Array.isArray(player.attackHistory) ? [...player.attackHistory] : [];
  next.unshift(item);
  player.attackHistory = next.slice(0, limit);
}

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
    console.error('Erro em estimateBattle:', error);
    return res.status(500).json({ error: 'Erro ao estimar batalha' });
  }
}

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

    return res.status(201).json({
      success: true,
      ...buildResponse(attack),
    });
  } catch (error) {
    console.error('Erro em startBattle:', error);
    return res.status(500).json({ error: 'Erro ao iniciar batalha' });
  }
}

export async function resolveBattle(req, res) {
  try {
    const requesterId = String(req.user.id);
    const { battleId } = req.params;

    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) {
      return res.status(404).json({ error: 'Batalha não encontrada' });
    }

    if (String(attack.attackerId) !== requesterId) {
      return res.status(403).json({ error: 'Somente a atacante pode resolver esta batalha' });
    }

    if (attack.status === 'resolved') {
      return res.json(buildResponse(attack));
    }

    if (attack.arriveAtIso && new Date(attack.arriveAtIso).getTime() > Date.now()) {
      return res.status(409).json({ error: 'A marcha ainda não chegou ao destino' });
    }

    const attacker = await Player.findById(String(attack.attackerId));
    const defender = await Player.findById(String(attack.targetId));

    if (!attacker || !defender) {
      return res.status(404).json({ error: 'Jogadores da batalha não encontrados' });
    }

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

    attacker.balances.dirtyMoney = result.nextDirtyMoneyAtacante;
    defender.balances.dirtyMoney = result.nextDirtyMoneyDefensor;

    attacker.gang = result.nextAttackerGang;
    defender.gang = result.nextDefenderGang;

    bumpVersion(attacker);
    bumpVersion(defender);

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

    await Promise.all([attacker.save(), defender.save(), attack.save()]);

    await Promise.all([
      sendAttackMail({
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
      sendAttackMail({
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

    return res.json(buildResponse(attack));
  } catch (error) {
    console.error('Erro em resolveBattle:', error);
    return res.status(500).json({ error: 'Erro ao resolver batalha' });
  }
}

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
    console.error('Erro em getBattleReport:', error);
    return res.status(500).json({ error: 'Erro ao buscar relatório' });
  }
}

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
    console.error('Erro em getBattleHistory:', error);
    return res.status(500).json({ error: 'Erro ao buscar histórico de batalha' });
  }
}

export async function initiateAttack(req, res) {
  return startBattle(req, res);
}