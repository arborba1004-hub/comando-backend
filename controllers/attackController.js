import Attack from '../models/Attack.js';
import Player from '../models/Player.js';
import {
  bumpVersion,
  calculateLoot,
  calculatePlayerPower,
  calculateWinChance,
  generateId,
} from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';

const ATTACK_COOLDOWN_MS = 30000;
const ATTACK_CORRE_COST = 10;
const DEFENDER_PVP_PROTECTION_MS = 30000;
const MAX_HISTORY = 50;
const MAX_NOTIFICATIONS = 20;

function safeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function buildSnapshot(player) {
  return {
    level: safeNumber(player?.niveis?.playerLevel, 1),
    power: safeNumber(player?.power, calculatePlayerPower(player)),
    dirtyMoney: safeNumber(player?.balances?.dirtyMoney, 0),
    corre: safeNumber(player?.balances?.corre, 0),
    skills: {
      attack: safeNumber(player?.skills?.attack, 0),
      defense: safeNumber(player?.skills?.defense, 0),
      intelligence: safeNumber(player?.skills?.intelligence, 0),
      agility: safeNumber(player?.skills?.agility, 0),
      respect: safeNumber(player?.skills?.respect, 0),
      vigor: safeNumber(player?.skills?.vigor, 0),
    },
    barracoLevel: safeNumber(player?.niveis?.barracoLevel, 1),
    hierarchyLevel: safeNumber(player?.niveis?.hierarchyLevel, 1),
    arsenalLevel: safeNumber(player?.niveis?.arsenalLevel, 1),
  };
}

function buildHistoryItem(attack) {
  return {
    id: attack.id,
    attackerId: attack.attackerId,
    attackerName: attack.attackerName,
    targetId: attack.targetId,
    targetName: attack.targetName,
    success: attack.success,
    loot: attack.loot,
    createdAt: attack.createdAtIso,
  };
}

function pushLimited(list, item, max) {
  const next = Array.isArray(list) ? [...list] : [];
  next.unshift(item);
  return next.slice(0, max);
}

function buildAttackerNotification(attack) {
  return {
    id: generateId(),
    type: attack.success ? 'attack_success' : 'attack_failed',
    attackerId: attack.attackerId,
    attackerName: attack.attackerName,
    targetId: attack.targetId,
    targetName: attack.targetName,
    success: attack.success,
    loot: attack.loot,
    createdAt: new Date().toISOString(),
    read: false,
  };
}

function buildDefenderNotification(attack) {
  return {
    id: generateId(),
    type: 'attack_received',
    attackerId: attack.attackerId,
    attackerName: attack.attackerName,
    targetId: attack.targetId,
    targetName: attack.targetName,
    success: attack.success,
    loot: attack.loot,
    createdAt: new Date().toISOString(),
    read: false,
  };
}

function buildBattleResponse(attack) {
  return {
    battleId: attack.id,
    resolution: {
      success: attack.success,
      critical: attack.critical,
      loot: attack.loot,
      chance: attack.chance,
      attackerPower: attack.attackerPower,
      defenderPower: attack.defenderPower,
      message: attack.message,
    },
    attacker: {
      playerId: attack.attackerId,
      playerName: attack.attackerName,
    },
    defender: {
      playerId: attack.targetId,
      playerName: attack.targetName,
    },
  };
}

function resolveAttackMath(attacker, defender) {
  const attackerPower = safeNumber(attacker.power, calculatePlayerPower(attacker));
  const defenderPower = safeNumber(defender.power, calculatePlayerPower(defender));

  const chance = calculateWinChance(attackerPower, defenderPower);
  const critical = Math.random() < 0.15;
  const success = Math.random() < chance;

  let loot = 0;
  let attackerDirtyMoneyDelta = 0;
  let defenderDirtyMoneyDelta = 0;

  if (success) {
    loot = calculateLoot(
      safeNumber(defender.balances?.dirtyMoney, 0),
      safeNumber(defender.niveis?.playerLevel, 1),
      critical
    );

    attackerDirtyMoneyDelta = loot;
    defenderDirtyMoneyDelta = -loot;
  } else {
    const penalty = Math.floor(safeNumber(attacker.balances?.dirtyMoney, 0) * 0.05);
    attackerDirtyMoneyDelta = -penalty;
    loot = 0;
  }

  return {
    chance,
    critical,
    success,
    loot,
    attackerPower,
    defenderPower,
    attackerDirtyMoneyDelta,
    defenderDirtyMoneyDelta,
    attackerCorreDelta: -ATTACK_CORRE_COST,
    defenderCorreDelta: 0,
    message: success
      ? critical
        ? 'Ataque crítico! Você dominou o território.'
        : 'Ataque bem-sucedido!'
      : 'Seu ataque falhou. Você perdeu 5% do dinheiro sujo.',
  };
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
    } = req.body || {};

    if (!targetId) {
      return res.status(400).json({ error: 'targetId é obrigatório' });
    }

    if (String(attacker._id) === String(targetId)) {
      return res.status(400).json({ error: 'Não pode atacar a si mesmo' });
    }

    const defender = await Player.findById(targetId);
    if (!defender) {
      return res.status(404).json({ error: 'Jogador alvo não encontrado' });
    }

    const pvpUntil = defender.punishments?.pvpProtectionUntil;
    if (pvpUntil && new Date(pvpUntil) > new Date()) {
      return res.status(403).json({ error: 'Este jogador está sob proteção' });
    }

    if (defender.punishments?.dirtyMoneyBlocked) {
      return res.status(403).json({ error: 'Alvo está com dinheiro sujo bloqueado' });
    }

    const now = Date.now();
    if (attacker.lastAttackAt && now - attacker.lastAttackAt < ATTACK_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Aguarde 30 segundos para atacar novamente' });
    }

    if ((attacker.balances?.corre || 0) < ATTACK_CORRE_COST) {
      return res.status(400).json({ error: 'Corre insuficiente para atacar' });
    }

    const attackerPower = safeNumber(attacker.power, calculatePlayerPower(attacker));
    const defenderPower = safeNumber(defender.power, calculatePlayerPower(defender));
    const chance = calculateWinChance(attackerPower, defenderPower);
    const estimatedLoot = calculateLoot(
      safeNumber(defender.balances?.dirtyMoney, 0),
      safeNumber(defender.niveis?.playerLevel, 1),
      false
    );

    const attack = await Attack.create({
      id: generateId(),
      status: 'started',
      attackerId: String(attacker._id),
      attackerName: attacker.name,
      targetId: String(defender._id),
      targetName: defender.name,
      origin: {
        tileX: safeNumber(originTileX, attacker.mapPosition?.tileX || 0),
        tileY: safeNumber(originTileY, attacker.mapPosition?.tileY || 0),
      },
      target: {
        tileX: safeNumber(targetTileX, defender.mapPosition?.tileX || 0),
        tileY: safeNumber(targetTileY, defender.mapPosition?.tileY || 0),
      },
      attackerPower,
      defenderPower,
      chance: Number((chance * 100).toFixed(2)),
      loot: estimatedLoot,
      attackerSnapshot: buildSnapshot(attacker),
      defenderSnapshot: buildSnapshot(defender),
      message: 'Batalha iniciada.',
    });

    return res.json({
      battleId: attack.id,
      success: true,
      message: 'Batalha iniciada.',
      estimatedLoot,
      estimatedChance: Number((chance * 100).toFixed(2)),
      attackerPower,
      defenderPower,
      route: {
        fromTileX: attack.origin.tileX,
        fromTileY: attack.origin.tileY,
        toTileX: attack.target.tileX,
        toTileY: attack.target.tileY,
      },
    });
  } catch (error) {
    console.error('Erro ao iniciar batalha:', error);
    return res.status(500).json({ error: 'Erro ao iniciar batalha' });
  }
}

export async function resolveBattle(req, res) {
  try {
    const requester = req.player;
    const { battleId } = req.params;

    const attack = await Attack.findOne({ id: battleId });
    if (!attack) {
      return res.status(404).json({ error: 'Batalha não encontrada' });
    }

    if (
      String(attack.attackerId) !== String(requester._id) &&
      String(attack.targetId) !== String(requester._id)
    ) {
      return res.status(403).json({ error: 'Você não tem acesso a esta batalha' });
    }

    if (attack.status === 'resolved') {
      return res.json(buildBattleResponse(attack));
    }

    const attacker = await Player.findById(attack.attackerId);
    const defender = await Player.findById(attack.targetId);

    if (!attacker || !defender) {
      return res.status(404).json({ error: 'Atacante ou defensor não encontrado' });
    }

    const now = Date.now();
    const math = resolveAttackMath(attacker, defender);

    attacker.balances.dirtyMoney = Math.max(
      0,
      safeNumber(attacker.balances?.dirtyMoney, 0) + math.attackerDirtyMoneyDelta
    );
    defender.balances.dirtyMoney = Math.max(
      0,
      safeNumber(defender.balances?.dirtyMoney, 0) + math.defenderDirtyMoneyDelta
    );

    attacker.balances.corre = Math.max(
      0,
      safeNumber(attacker.balances?.corre, 0) + math.attackerCorreDelta
    );
    defender.balances.corre = Math.max(
      0,
      safeNumber(defender.balances?.corre, 0) + math.defenderCorreDelta
    );

    attacker.lastAttackAt = now;

    defender.punishments = defender.punishments || {};
    defender.punishments.pvpProtectionUntil = new Date(
      now + DEFENDER_PVP_PROTECTION_MS
    ).toISOString();

    attack.status = 'resolved';
    attack.success = math.success;
    attack.critical = math.critical;
    attack.loot = math.loot;
    attack.chance = Number((math.chance * 100).toFixed(2));
    attack.attackerPower = math.attackerPower;
    attack.defenderPower = math.defenderPower;
    attack.attackerDirtyMoneyDelta = math.attackerDirtyMoneyDelta;
    attack.defenderDirtyMoneyDelta = math.defenderDirtyMoneyDelta;
    attack.attackerCorreDelta = math.attackerCorreDelta;
    attack.defenderCorreDelta = math.defenderCorreDelta;
    attack.message = math.message;
    attack.resolvedAtIso = new Date().toISOString();

    const historyItem = buildHistoryItem(attack);
    const attackerNotification = buildAttackerNotification(attack);
    const defenderNotification = buildDefenderNotification(attack);

    attacker.attackHistory = pushLimited(attacker.attackHistory, historyItem, MAX_HISTORY);
    defender.attackHistory = pushLimited(defender.attackHistory, historyItem, MAX_HISTORY);

    attacker.notifications = pushLimited(
      attacker.notifications,
      attackerNotification,
      MAX_NOTIFICATIONS
    );
    defender.notifications = pushLimited(
      defender.notifications,
      defenderNotification,
      MAX_NOTIFICATIONS
    );

    bumpVersion(attacker);
    bumpVersion(defender);

    await attacker.save();
    await defender.save();
    await attack.save();

    return res.json(buildBattleResponse(attack));
  } catch (error) {
    console.error('Erro ao resolver batalha:', error);
    return res.status(500).json({ error: 'Erro ao resolver batalha' });
  }
}

export async function getBattleReport(req, res) {
  try {
    const requester = req.player;
    const { battleId } = req.params;

    const attack = await Attack.findOne({ id: battleId });
    if (!attack) {
      return res.status(404).json({ error: 'Relatório não encontrado' });
    }

    if (
      String(attack.attackerId) !== String(requester._id) &&
      String(attack.targetId) !== String(requester._id)
    ) {
      return res.status(403).json({ error: 'Você não tem acesso a este relatório' });
    }

    return res.json(buildBattleResponse(attack));
  } catch (error) {
    console.error('Erro ao buscar relatório:', error);
    return res.status(500).json({ error: 'Erro ao buscar relatório' });
  }
}

export async function getBattleHistory(req, res) {
  try {
    const requester = req.player;

    const attacks = await Attack.find({
      $or: [
        { attackerId: String(requester._id) },
        { targetId: String(requester._id) },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(attacks.map(buildBattleResponse));
  } catch (error) {
    console.error('Erro ao buscar histórico de batalhas:', error);
    return res.status(500).json({ error: 'Erro ao buscar histórico de batalhas' });
  }
}

export async function initiateAttack(req, res) {
  return startBattle(req, res);
}