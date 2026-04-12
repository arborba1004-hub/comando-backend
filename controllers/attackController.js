import Attack from '../models/Attack.js';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
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

function calculateFactionInvestmentBuffs(investments = {}) {
  const arsenal = Math.max(0, safeNumber(investments.arsenalColetivo, 0));
  const caixa = Math.max(0, safeNumber(investments.caixaOperacional, 0));
  const mobilidade = Math.max(0, safeNumber(investments.mobilidade, 0));
  const influencia = Math.max(0, safeNumber(investments.influencia, 0));
  const inteligencia = Math.max(0, safeNumber(investments.inteligencia, 0));
  const fortificacao = Math.max(0, safeNumber(investments.fortificacao, 0));
  const logistica = Math.max(0, safeNumber(investments.logistica, 0));
  const doutrina = Math.max(0, safeNumber(investments.doutrina, 0));

  return {
    attackPercent: arsenal * 2 + doutrina * 0.5,
    defensePercent: arsenal * 1.5 + fortificacao * 2 + doutrina * 0.5,
    hpPercent: arsenal * 1 + fortificacao * 1.5 + doutrina * 0.5,
    dirtyMoneyGainPercent: caixa * 2 + doutrina * 0.5,
    cleanMoneyGainPercent: caixa * 1.5 + doutrina * 0.5,
    agilityPercent: mobilidade * 2 + doutrina * 0.5,
    intelligencePercent: inteligencia * 2 + doutrina * 0.5,
    respectPercent: influencia * 2 + doutrina * 0.5,
    baseDefensePercent: fortificacao * 2 + doutrina * 0.5,
    donationEfficiencyPercent: logistica * 2 + doutrina * 0.5,
    buffDurationPercent: logistica * 1.5 + doutrina * 0.5,
  };
}

async function getFactionCombatContext(player) {
  try {
    if (!player?.factionId) {
      return null;
    }

    const faction = await Faction.findOne(
      { id: String(player.factionId) },
      {
        id: 1,
        name: 1,
        tag: 1,
        investments: 1,
        investmentBuffs: 1,
      }
    ).lean();

    if (!faction) {
      return null;
    }

    const investmentBuffs =
      faction.investmentBuffs && typeof faction.investmentBuffs === 'object'
        ? {
            attackPercent: safeNumber(faction.investmentBuffs.attackPercent, 0),
            defensePercent: safeNumber(faction.investmentBuffs.defensePercent, 0),
            hpPercent: safeNumber(faction.investmentBuffs.hpPercent, 0),
            dirtyMoneyGainPercent: safeNumber(faction.investmentBuffs.dirtyMoneyGainPercent, 0),
            cleanMoneyGainPercent: safeNumber(faction.investmentBuffs.cleanMoneyGainPercent, 0),
            agilityPercent: safeNumber(faction.investmentBuffs.agilityPercent, 0),
            intelligencePercent: safeNumber(faction.investmentBuffs.intelligencePercent, 0),
            respectPercent: safeNumber(faction.investmentBuffs.respectPercent, 0),
            baseDefensePercent: safeNumber(faction.investmentBuffs.baseDefensePercent, 0),
            donationEfficiencyPercent: safeNumber(faction.investmentBuffs.donationEfficiencyPercent, 0),
            buffDurationPercent: safeNumber(faction.investmentBuffs.buffDurationPercent, 0),
          }
        : calculateFactionInvestmentBuffs(faction.investments || {});

    return {
      factionId: String(faction.id),
      factionName: String(faction.name || ''),
      factionTag: String(faction.tag || ''),
      investmentBuffs,
    };
  } catch (error) {
    console.error('Erro ao carregar contexto de facção no ataque:', error);
    return null;
  }
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
    createdAt: attack.createdAtIso || attack.createdAt || new Date().toISOString(),
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
      attackerFactionAttackBonusPercent: safeNumber(attack.attackerFactionAttackBonusPercent, 0),
      attackerFactionAgilityBonusPercent: safeNumber(attack.attackerFactionAgilityBonusPercent, 0),
      attackerFactionIntelligenceBonusPercent: safeNumber(attack.attackerFactionIntelligenceBonusPercent, 0),
      defenderFactionDefenseBonusPercent: safeNumber(attack.defenderFactionDefenseBonusPercent, 0),
      defenderFactionBaseDefenseBonusPercent: safeNumber(attack.defenderFactionBaseDefenseBonusPercent, 0),
      defenderFactionHpBonusPercent: safeNumber(attack.defenderFactionHpBonusPercent, 0),
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

function resolveAttackMath(attacker, defender, attackerFaction, defenderFaction) {
  const attackerBasePower = safeNumber(attacker.power, calculatePlayerPower(attacker));
  const defenderBasePower = safeNumber(defender.power, calculatePlayerPower(defender));

  const attackerBuffs = attackerFaction?.investmentBuffs || {};
  const defenderBuffs = defenderFaction?.investmentBuffs || {};

  const attackerAttackPercent = safeNumber(attackerBuffs.attackPercent, 0);
  const attackerAgilityPercent = safeNumber(attackerBuffs.agilityPercent, 0);
  const attackerIntelligencePercent = safeNumber(attackerBuffs.intelligencePercent, 0);
  const attackerRespectPercent = safeNumber(attackerBuffs.respectPercent, 0);

  const defenderDefensePercent = safeNumber(defenderBuffs.defensePercent, 0);
  const defenderBaseDefensePercent = safeNumber(defenderBuffs.baseDefensePercent, 0);
  const defenderHpPercent = safeNumber(defenderBuffs.hpPercent, 0);
  const defenderAgilityPercent = safeNumber(defenderBuffs.agilityPercent, 0);
  const defenderIntelligencePercent = safeNumber(defenderBuffs.intelligencePercent, 0);

  const effectiveAttackerPower = Math.floor(
    attackerBasePower *
      (1 +
        (attackerAttackPercent * 1.0 +
          attackerAgilityPercent * 0.35 +
          attackerIntelligencePercent * 0.25 +
          attackerRespectPercent * 0.15) /
          100)
  );

  const effectiveDefenderPower = Math.floor(
    defenderBasePower *
      (1 +
        (defenderDefensePercent * 1.0 +
          defenderBaseDefensePercent * 0.8 +
          defenderHpPercent * 0.4 +
          defenderAgilityPercent * 0.2 +
          defenderIntelligencePercent * 0.2) /
          100)
  );

  const chance = calculateWinChance(effectiveAttackerPower, effectiveDefenderPower);
  const critical = Math.random() < 0.15;
  const success = Math.random() < chance;

  let loot = 0;
  let attackerDirtyMoneyDelta = 0;
  let defenderDirtyMoneyDelta = 0;

  if (success) {
    const baseLoot = calculateLoot(
      safeNumber(defender.balances?.dirtyMoney, 0),
      safeNumber(defender.niveis?.playerLevel, 1),
      critical
    );

    const lootModifier = Math.max(
      0.4,
      Math.min(
        2.5,
        1 +
          (attackerAttackPercent * 0.0025 +
            attackerRespectPercent * 0.002 +
            attackerIntelligencePercent * 0.0015 -
            defenderDefensePercent * 0.0015 -
            defenderBaseDefensePercent * 0.0025 -
            defenderHpPercent * 0.0015)
      )
    );

    loot = Math.max(0, Math.floor(baseLoot * lootModifier));

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
    attackerPower: effectiveAttackerPower,
    defenderPower: effectiveDefenderPower,
    attackerDirtyMoneyDelta,
    defenderDirtyMoneyDelta,
    attackerCorreDelta: -ATTACK_CORRE_COST,
    defenderCorreDelta: 0,
    attackerFactionAttackBonusPercent: attackerAttackPercent,
    attackerFactionAgilityBonusPercent: attackerAgilityPercent,
    attackerFactionIntelligenceBonusPercent: attackerIntelligencePercent,
    defenderFactionDefenseBonusPercent: defenderDefensePercent,
    defenderFactionBaseDefenseBonusPercent: defenderBaseDefensePercent,
    defenderFactionHpBonusPercent: defenderHpPercent,
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

    if (attacker.factionId && defender.factionId && String(attacker.factionId) === String(defender.factionId)) {
      return res.status(403).json({ error: 'Você não pode atacar membros da mesma facção' });
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

    const attackerFaction = await getFactionCombatContext(attacker);
    const defenderFaction = await getFactionCombatContext(defender);

    const previewMath = resolveAttackMath(attacker, defender, attackerFaction, defenderFaction);

    const attack = await Attack.create({
      id: generateId(),
      status: 'started',
      attackerId: String(attacker._id),
      attackerName: attacker.name,
      attackerFactionId: attackerFaction?.factionId || null,
      attackerFactionName: attackerFaction?.factionName || '',
      attackerFactionTag: attackerFaction?.factionTag || '',
      targetId: String(defender._id),
      targetName: defender.name,
      defenderFactionId: defenderFaction?.factionId || null,
      defenderFactionName: defenderFaction?.factionName || '',
      defenderFactionTag: defenderFaction?.factionTag || '',
      origin: {
        tileX: safeNumber(originTileX, attacker.mapPosition?.tileX || 0),
        tileY: safeNumber(originTileY, attacker.mapPosition?.tileY || 0),
      },
      target: {
        tileX: safeNumber(targetTileX, defender.mapPosition?.tileX || 0),
        tileY: safeNumber(targetTileY, defender.mapPosition?.tileY || 0),
      },
      attackerPower: previewMath.attackerPower,
      defenderPower: previewMath.defenderPower,
      chance: Number((previewMath.chance * 100).toFixed(2)),
      loot: previewMath.loot,
      attackerFactionAttackBonusPercent: previewMath.attackerFactionAttackBonusPercent,
      attackerFactionAgilityBonusPercent: previewMath.attackerFactionAgilityBonusPercent,
      attackerFactionIntelligenceBonusPercent: previewMath.attackerFactionIntelligenceBonusPercent,
      defenderFactionDefenseBonusPercent: previewMath.defenderFactionDefenseBonusPercent,
      defenderFactionBaseDefenseBonusPercent: previewMath.defenderFactionBaseDefenseBonusPercent,
      defenderFactionHpBonusPercent: previewMath.defenderFactionHpBonusPercent,
      attackerSnapshot: buildSnapshot(attacker),
      defenderSnapshot: buildSnapshot(defender),
      message: 'Batalha iniciada.',
    });

    return res.json({
      battleId: attack.id,
      success: true,
      message: 'Batalha iniciada.',
      estimatedLoot: previewMath.loot,
      estimatedChance: Number((previewMath.chance * 100).toFixed(2)),
      attackerPower: previewMath.attackerPower,
      defenderPower: previewMath.defenderPower,
      attackerFaction: attackerFaction
        ? {
            factionId: attackerFaction.factionId,
            factionName: attackerFaction.factionName,
            factionTag: attackerFaction.factionTag,
            investmentBuffs: attackerFaction.investmentBuffs,
          }
        : null,
      defenderFaction: defenderFaction
        ? {
            factionId: defenderFaction.factionId,
            factionName: defenderFaction.factionName,
            factionTag: defenderFaction.factionTag,
            investmentBuffs: defenderFaction.investmentBuffs,
          }
        : null,
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

    if (attacker.factionId && defender.factionId && String(attacker.factionId) === String(defender.factionId)) {
      return res.status(403).json({ error: 'Você não pode atacar membros da mesma facção' });
    }

    const now = Date.now();

    const attackerFaction = await getFactionCombatContext(attacker);
    const defenderFaction = await getFactionCombatContext(defender);
    const math = resolveAttackMath(attacker, defender, attackerFaction, defenderFaction);

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
    attack.attackerFactionAttackBonusPercent = math.attackerFactionAttackBonusPercent;
    attack.attackerFactionAgilityBonusPercent = math.attackerFactionAgilityBonusPercent;
    attack.attackerFactionIntelligenceBonusPercent = math.attackerFactionIntelligenceBonusPercent;
    attack.defenderFactionDefenseBonusPercent = math.defenderFactionDefenseBonusPercent;
    attack.defenderFactionBaseDefenseBonusPercent = math.defenderFactionBaseDefenseBonusPercent;
    attack.defenderFactionHpBonusPercent = math.defenderFactionHpBonusPercent;
    attack.attackerFactionId = attackerFaction?.factionId || null;
    attack.attackerFactionName = attackerFaction?.factionName || '';
    attack.attackerFactionTag = attackerFaction?.factionTag || '';
    attack.defenderFactionId = defenderFaction?.factionId || null;
    attack.defenderFactionName = defenderFaction?.factionName || '';
    attack.defenderFactionTag = defenderFaction?.factionTag || '';
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
    def