import Attack from '../models/Attack.js';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
import {
  bumpVersion,
  calculateLoot,
  calculatePlayerPower,
  generateId,
} from '../utils/gameHelpers.js';
import {
  applyBattleLossesToPlayerGang,
  getGangCombatContext,
  resolveGangCasualties,
} from '../services/gangWarService.js';

const ATTACK_COOLDOWN_MS = 30_000;
const ATTACK_CORRE_COST = 10;
const DEFENDER_PVP_PROTECTION_MS = 30_000;
const MAX_HISTORY = 50;
const MAX_NOTIFICATIONS = 20;

function safeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

async function getFactionCombatContext(player) {
  if (!player?.factionId) return null;

  try {
    const faction = await Faction.findOne(
      { id: String(player.factionId) },
      {
        id: 1,
        name: 1,
        tag: 1,
        investmentBuffs: 1,
      }
    ).lean();

    if (!faction) return null;

    return {
      factionId: String(faction.id),
      factionName: String(faction.name || ''),
      factionTag: String(faction.tag || ''),
      investmentBuffs: faction.investmentBuffs || {},
    };
  } catch (error) {
    console.error('Erro ao carregar facção no combate:', error);
    return null;
  }
}

function calculateWinChance(attackerPower, defenderPower) {
  const total = Math.max(1, attackerPower + defenderPower);
  const raw = attackerPower / total;
  return clamp(raw, 0.12, 0.88);
}

function buildMath({
  attacker,
  defender,
  attackerFaction,
  defenderFaction,
  attackerGangStats,
  defenderGangStats,
}) {
  const attackerBasePower = safeNumber(attacker?.power, calculatePlayerPower(attacker));
  const defenderBasePower = safeNumber(defender?.power, calculatePlayerPower(defender));

  const atkBuffs = attackerFaction?.investmentBuffs || {};
  const defBuffs = defenderFaction?.investmentBuffs || {};

  const attackerPower = Math.round(
    attackerBasePower *
      (1 + safeNumber(atkBuffs.attackPercent, 0) / 100 + safeNumber(attacker?.skills?.attack, 0) / 1000) +
      safeNumber(attackerGangStats?.totalPower, 0) * 0.65 +
      safeNumber(attackerGangStats?.mobilityPower, 0) * 1.8 +
      safeNumber(attackerGangStats?.coordinationPower, 0) * 1.3
  );

  const defenderPower = Math.round(
    defenderBasePower *
      (1 + safeNumber(defBuffs.defensePercent, 0) / 100 + safeNumber(defender?.skills?.defense, 0) / 1000) +
      safeNumber(defenderGangStats?.totalPower, 0) * 0.7 +
      safeNumber(defenderGangStats?.blindagem, 0) * 1.2 +
      safeNumber(defenderGangStats?.medicalPower, 0) * 0.8
  );

  const chance = calculateWinChance(attackerPower, defenderPower);
  const critical = Math.random() < 0.12;
  const success = Math.random() < (critical ? Math.min(0.95, chance + 0.08) : chance);

  let loot = 0;
  let attackerDirtyMoneyDelta = 0;
  let defenderDirtyMoneyDelta = 0;

  if (success) {
    const baseLoot = calculateLoot(
      safeNumber(defender?.balances?.dirtyMoney, 0),
      safeNumber(defender?.niveis?.playerLevel, 1),
      critical
    );

    const lootModifier =
      1 +
      safeNumber(attackerGangStats?.lootPower, 0) / 300 +
      safeNumber(attackerGangStats?.economyPower, 0) / 500 +
      safeNumber(attackerGangStats?.negotiationPower, 0) / 650 -
      safeNumber(defenderGangStats?.blindagem, 0) / 900;

    loot = Math.max(0, Math.floor(baseLoot * clamp(lootModifier, 0.5, 2.1)));
    attackerDirtyMoneyDelta = loot;
    defenderDirtyMoneyDelta = -loot;
  } else {
    attackerDirtyMoneyDelta = -Math.floor(safeNumber(attacker?.balances?.dirtyMoney, 0) * 0.05);
  }

  return {
    success,
    critical,
    loot,
    chance,
    attackerPower,
    defenderPower,
    attackerDirtyMoneyDelta,
    defenderDirtyMoneyDelta,
  };
}

function pushLimited(list, item, max) {
  const next = Array.isArray(list) ? [...list] : [];
  next.unshift(item);
  return next.slice(0, max);
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
    createdAt: attack.createdAtIso || new Date().toISOString(),
    attackerGangLosses: attack.attackerGangLosses || undefined,
    defenderGangLosses: attack.defenderGangLosses || undefined,
  };
}

function buildNotification(attack, type) {
  return {
    id: generateId(),
    type,
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
      spoils: {
        dirtyMoneyLoot: attack.loot,
        correLoot: 0,
        prestigeLoot: 0,
        brokenLuxuryItemId: null,
        brokenLuxuryItemName: null,
        brokenLuxuryItemValue: null,
        luxuryConvertedDirtyMoney: 0,
      },
      attackerGangLosses: attack.attackerGangLosses || null,
      defenderGangLosses: attack.defenderGangLosses || null,
      attackerGangStats: attack.attackerGangStats || null,
      defenderGangStats: attack.defenderGangStats || null,
    },
    attacker: {
      playerId: attack.attackerId,
      playerName: attack.attackerName,
      factionId: attack.attackerFactionId || null,
      factionName: attack.attackerFactionName || '',
      factionTag: attack.attackerFactionTag || '',
    },
    defender: {
      playerId: attack.targetId,
      playerName: attack.targetName,
      factionId: attack.defenderFactionId || null,
      factionName: attack.defenderFactionName || '',
      factionTag: attack.defenderFactionTag || '',
    },
  };
}

async function estimateOrStart(req, res, shouldPersist) {
  const attacker = req.player;
  const {
    targetId,
    targetName,
    targetTileX,
    targetTileY,
    originTileX,
    originTileY,
    selectedTroops = [],
    selectedMemberIds = [],
  } = req.body || {};

  if (!targetId) {
    return res.status(400).json({ error: 'targetId é obrigatório' });
  }

  if (String(attacker._id) === String(targetId)) {
    return res.status(400).json({ error: 'Você não pode atacar a si mesma' });
  }

  const defender = await Player.findById(targetId);
  if (!defender) {
    return res.status(404).json({ error: 'Jogador alvo não encontrado' });
  }

  const pvpUntil = defender?.punishments?.pvpProtectionUntil;
  if (pvpUntil && new Date(pvpUntil) > new Date()) {
    return res.status(403).json({ error: 'Este jogador está sob proteção PvP' });
  }

  if (shouldPersist) {
    const now = Date.now();
    if (attacker.lastAttackAt && now - attacker.lastAttackAt < ATTACK_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Aguarde o cooldown de ataque' });
    }

    if (safeNumber(attacker?.balances?.corre, 0) < ATTACK_CORRE_COST) {
      return res.status(400).json({ error: 'Corre insuficiente para atacar' });
    }
  }

  const attackerFaction = await getFactionCombatContext(attacker);
  const defenderFaction = await getFactionCombatContext(defender);

  const attackerGangContext = await getGangCombatContext(attacker, {
    selectedTroops,
    selectedMemberIds,
  });
  const defenderGangContext = await getGangCombatContext(defender);

  if (!attackerGangContext.marchMembers.length) {
    return res.status(400).json({ error: 'Selecione tropas ativas para marchar' });
  }

  const math = buildMath({
    attacker,
    defender,
    attackerFaction,
    defenderFaction,
    attackerGangStats: attackerGangContext.stats,
    defenderGangStats: defenderGangContext.stats,
  });

  if (!shouldPersist) {
    return res.json({
      estimatedLoot: math.loot,
      estimatedChance: Math.round(math.chance * 10000) / 100,
      attackerPower: math.attackerPower,
      defenderPower: math.defenderPower,
      correCost: ATTACK_CORRE_COST,
      attackerGangPower: attackerGangContext.stats.totalPower,
      defenderGangPower: defenderGangContext.stats.totalPower,
    });
  }

  attacker.balances.corre = Math.max(0, safeNumber(attacker?.balances?.corre, 0) - ATTACK_CORRE_COST);
  attacker.lastAttackAt = Date.now();
  bumpVersion(attacker);
  await attacker.save();

  const attack = await Attack.create({
    id: generateId(),
    status: 'started',
    attackerId: String(attacker._id),
    attackerName: attacker.name,
    attackerFactionId: attackerFaction?.factionId || null,
    attackerFactionName: attackerFaction?.factionName || '',
    attackerFactionTag: attackerFaction?.factionTag || '',
    targetId: String(defender._id),
    targetName: targetName || defender.name,
    defenderFactionId: defenderFaction?.factionId || null,
    defenderFactionName: defenderFaction?.factionName || '',
    defenderFactionTag: defenderFaction?.factionTag || '',
    origin: {
      tileX: safeNumber(originTileX, safeNumber(attacker?.mapPosition?.tileX, 0)),
      tileY: safeNumber(originTileY, safeNumber(attacker?.mapPosition?.tileY, 0)),
    },
    target: {
      tileX: safeNumber(targetTileX, safeNumber(defender?.mapPosition?.tileX, 0)),
      tileY: safeNumber(targetTileY, safeNumber(defender?.mapPosition?.tileY, 0)),
    },
    chance: math.chance * 100,
    attackerPower: math.attackerPower,
    defenderPower: math.defenderPower,
    attackerSnapshot: buildSnapshot(attacker),
    defenderSnapshot: buildSnapshot(defender),
    attackerGangStats: attackerGangContext.stats,
    defenderGangStats: defenderGangContext.stats,
    selectedTroops: attackerGangContext.selectedTroops || [],
    selectedMemberIds: attackerGangContext.marchMembers.map((member) => member.id),
    message: 'Marcha criada com sucesso',
  });

  return res.json({
    battleId: attack.id,
    success: true,
    message: 'Marcha enviada',
    estimatedLoot: math.loot,
    estimatedChance: Math.round(math.chance * 10000) / 100,
    attackerPower: math.attackerPower,
    defenderPower: math.defenderPower,
    route: {
      fromTileX: attack.origin.tileX,
      fromTileY: attack.origin.tileY,
      toTileX: attack.target.tileX,
      toTileY: attack.target.tileY,
    },
  });
}

export async function estimateBattle(req, res) {
  try {
    return await estimateOrStart(req, res, false);
  } catch (error) {
    console.error('Erro em estimateBattle:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao estimar ataque' });
  }
}

export async function startBattle(req, res) {
  try {
    return await estimateOrStart(req, res, true);
  } catch (error) {
    console.error('Erro em startBattle:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao iniciar ataque' });
  }
}

export async function resolveBattle(req, res) {
  try {
    const attacker = req.player;
    const { battleId } = req.params;

    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) {
      return res.status(404).json({ error: 'Batalha não encontrada' });
    }

    if (String(attack.attackerId) !== String(attacker._id)) {
      return res.status(403).json({ error: 'Você não pode resolver esta batalha' });
    }

    if (attack.status === 'resolved') {
      return res.json(buildBattleResponse(attack));
    }

    const freshAttacker = await Player.findById(attack.attackerId);
    const defender = await Player.findById(attack.targetId);
    if (!freshAttacker || !defender) {
      return res.status(404).json({ error: 'Jogadores da batalha não encontrados' });
    }

    const attackerFaction = await getFactionCombatContext(freshAttacker);
    const defenderFaction = await getFactionCombatContext(defender);
    const attackerGangContext = await getGangCombatContext(freshAttacker, {
      selectedTroops: attack.selectedTroops || [],
      selectedMemberIds: attack.selectedMemberIds || [],
    });
    const defenderGangContext = await getGangCombatContext(defender);

    const math = buildMath({
      attacker: freshAttacker,
      defender,
      attackerFaction,
      defenderFaction,
      attackerGangStats: attackerGangContext.stats,
      defenderGangStats: defenderGangContext.stats,
    });

    const attackerLosses = resolveGangCasualties({
      members: attackerGangContext.marchMembers,
      ownStats: attackerGangContext.stats,
      enemyStats: defenderGangContext.stats,
      side: 'attacker',
    });

    const defenderLosses = resolveGangCasualties({
      members: defenderGangContext.marchMembers,
      ownStats: defenderGangContext.stats,
      enemyStats: attackerGangContext.stats,
      side: 'defender',
    });

    freshAttacker.balances.dirtyMoney = Math.max(
      0,
      safeNumber(freshAttacker?.balances?.dirtyMoney, 0) + math.attackerDirtyMoneyDelta
    );

    defender.balances.dirtyMoney = Math.max(
      0,
      safeNumber(defender?.balances?.dirtyMoney, 0) + math.defenderDirtyMoneyDelta
    );

    defender.punishments = defender.punishments || {};
    defender.punishments.pvpProtectionUntil = new Date(Date.now() + DEFENDER_PVP_PROTECTION_MS).toISOString();

    attack.status = 'resolved';
    attack.success = math.success;
    attack.critical = math.critical;
    attack.loot = math.loot;
    attack.chance = math.chance * 100;
    attack.attackerPower = math.attackerPower;
    attack.defenderPower = math.defenderPower;
    attack.attackerDirtyMoneyDelta = math.attackerDirtyMoneyDelta;
    attack.defenderDirtyMoneyDelta = math.defenderDirtyMoneyDelta;
    attack.attackerGangStats = attackerGangContext.stats;
    attack.defenderGangStats = defenderGangContext.stats;
    attack.attackerGangLosses = attackerLosses;
    attack.defenderGangLosses = defenderLosses;
    attack.message = math.success
      ? math.critical
        ? 'Ataque crítico bem-sucedido'
        : 'Ataque bem-sucedido'
      : 'A marcha falhou e recuou';
    attack.resolvedAtIso = new Date().toISOString();

    await Promise.all([
      applyBattleLossesToPlayerGang(freshAttacker._id, attackerLosses),
      applyBattleLossesToPlayerGang(defender._id, defenderLosses),
    ]);

    const historyItem = buildHistoryItem(attack);
    freshAttacker.attackHistory = pushLimited(freshAttacker.attackHistory, historyItem, MAX_HISTORY);
    defender.attackHistory = pushLimited(defender.attackHistory, historyItem, MAX_HISTORY);

    freshAttacker.notifications = pushLimited(
      freshAttacker.notifications,
      buildNotification(attack, math.success ? 'attack_success' : 'attack_failed'),
      MAX_NOTIFICATIONS
    );
    defender.notifications = pushLimited(
      defender.notifications,
      buildNotification(attack, 'attack_received'),
      MAX_NOTIFICATIONS
    );

    bumpVersion(freshAttacker);
    bumpVersion(defender);

    await Promise.all([freshAttacker.save(), defender.save(), attack.save()]);

    return res.json(buildBattleResponse(attack));
  } catch (error) {
    console.error('Erro em resolveBattle:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao resolver batalha' });
  }
}

export async function getBattleReport(req, res) {
  try {
    const { battleId } = req.params;
    const attack = await Attack.findOne({ id: String(battleId) });
    if (!attack) {
      return res.status(404).json({ error: 'Batalha não encontrada' });
    }
    return res.json(buildBattleResponse(attack));
  } catch (error) {
    console.error('Erro em getBattleReport:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao carregar relatório' });
  }
}

export async function getBattleHistory(req, res) {
  try {
    const playerId = String(req.player._id);
    const attacks = await Attack.find({
      $or: [{ attackerId: playerId }, { targetId: playerId }],
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(attacks.map((attack) => buildBattleResponse(attack)));
  } catch (error) {
    console.error('Erro em getBattleHistory:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Erro ao carregar histórico' });
  }
}

export async function initiateAttack(req, res) {
  return startBattle(req, res);
}
