import Attack from '../models/Attack.js';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
import GangWar from '../models/GangWar.js';
import {
  bumpVersion,
  calculateLoot,
  calculatePlayerPower,
  calculateWinChance,
  generateId,
} from '../utils/gameHelpers.js';

const ATTACK_COOLDOWN_MS = 30000;
const ATTACK_CORRE_COST = 10;
const DEFENDER_PVP_PROTECTION_MS = 30000;
const MAX_HISTORY = 50;
const MAX_NOTIFICATIONS = 20;

const GANG_MEMBER_TYPES = [
  'capanga',
  'frente',
  'executor',
  'assassino',
  'muralha',
  'certeiro',
  'motorista',
  'nitro',
  'armeiro',
  'informante',
  'wifi',
  'medico',
  'lavador',
  'ladrao',
  'negociador',
];

function safeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function emptyGangStats() {
  return {
    totalMembers: 0,
    ativos: 0,
    feridos: 0,
    mortos: 0,
    rajada: 0,
    blindagem: 0,
    folego: 0,
    quebra: 0,
    medicalPower: 0,
    economyPower: 0,
    lootPower: 0,
    intelPower: 0,
    mobilityPower: 0,
    weaponPower: 0,
    coordinationPower: 0,
    negotiationPower: 0,
    totalPower: 0,
  };
}

function emptyGangLosses() {
  return {
    mortos: {
      capanga: 0,
      frente: 0,
      executor: 0,
      assassino: 0,
      muralha: 0,
      certeiro: 0,
      motorista: 0,
      nitro: 0,
      armeiro: 0,
      informante: 0,
      wifi: 0,
      medico: 0,
      lavador: 0,
      ladrao: 0,
      negociador: 0,
    },
    feridos: {
      capanga: 0,
      frente: 0,
      executor: 0,
      assassino: 0,
      muralha: 0,
      certeiro: 0,
      motorista: 0,
      nitro: 0,
      armeiro: 0,
      informante: 0,
      wifi: 0,
      medico: 0,
      lavador: 0,
      ladrao: 0,
      negociador: 0,
    },
    preservadosPeloMedico: 0,
  };
}

function normalizeGangMembers(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((member) => ({
      id: safeString(member?.id),
      type: GANG_MEMBER_TYPES.includes(member?.type) ? member.type : 'capanga',
      level: Math.max(1, safeNumber(member?.level, 1)),
      status: safeString(member?.status, 'ativo'),
      recruitedAt: safeString(member?.recruitedAt, new Date().toISOString()),
      trainingEndsAt: member?.trainingEndsAt || null,
      injuryEndsAt: member?.injuryEndsAt || null,
      lastBattleAt: member?.lastBattleAt || null,
    }))
    .filter((member) => member.id);
}

function memberContribution(type, level, status) {
  const statusMultiplier =
    status === 'ativo' ? 1 : status === 'treinando' ? 0.55 : status === 'ferido' ? 0.25 : 0;

  const power = Math.max(1, level) * statusMultiplier;

  switch (type) {
    case 'capanga':
      return { rajada: power * 1.0, blindagem: power * 0.4, folego: power * 0.6 };
    case 'frente':
      return { rajada: power * 1.3, blindagem: power * 0.4, quebra: power * 0.8 };
    case 'executor':
      return { rajada: power * 1.2, quebra: power * 1.2, weaponPower: power * 0.7 };
    case 'assassino':
      return { rajada: power * 1.5, quebra: power * 1.4, mobilityPower: power * 0.5 };
    case 'muralha':
      return { blindagem: power * 1.8, folego: power * 1.2 };
    case 'certeiro':
      return { rajada: power * 1.1, intelPower: power * 0.7, weaponPower: power * 0.9 };
    case 'motorista':
      return { mobilityPower: power * 1.5, folego: power * 0.4 };
    case 'nitro':
      return { mobilityPower: power * 1.4, rajada: power * 0.8, quebra: power * 0.5 };
    case 'armeiro':
      return { weaponPower: power * 1.6, rajada: power * 0.5 };
    case 'informante':
      return { intelPower: power * 1.7, coordinationPower: power * 0.7 };
    case 'wifi':
      return { coordinationPower: power * 1.8, intelPower: power * 0.6 };
    case 'medico':
      return { medicalPower: power * 1.8, folego: power * 0.7 };
    case 'lavador':
      return { economyPower: power * 1.8, lootPower: power * 0.4 };
    case 'ladrao':
      return { lootPower: power * 1.7, mobilityPower: power * 0.5, quebra: power * 0.4 };
    case 'negociador':
      return { negotiationPower: power * 1.8, economyPower: power * 0.7, coordinationPower: power * 0.5 };
    default:
      return {};
  }
}

function buildGangBattleCompositionStats(members = []) {
  const stats = emptyGangStats();
  const normalizedMembers = normalizeGangMembers(members);

  stats.totalMembers = normalizedMembers.length;
  stats.ativos = normalizedMembers.filter((m) => m.status === 'ativo').length;
  stats.feridos = normalizedMembers.filter((m) => m.status === 'ferido').length;
  stats.mortos = normalizedMembers.filter((m) => m.status === 'morto').length;

  normalizedMembers.forEach((member) => {
    const contribution = memberContribution(member.type, member.level, member.status);
    Object.entries(contribution).forEach(([key, value]) => {
      stats[key] = safeNumber(stats[key], 0) + safeNumber(value, 0);
    });
  });

  stats.totalPower = Number(
    (
      stats.rajada * 1.15 +
      stats.blindagem * 1.05 +
      stats.folego * 0.95 +
      stats.quebra * 1.2 +
      stats.intelPower * 0.35 +
      stats.mobilityPower * 0.3 +
      stats.weaponPower * 0.4 +
      stats.coordinationPower * 0.25
    ).toFixed(2)
  );

  return stats;
}

function pickRandomMemberOfType(members, type) {
  const pool = members.filter((member) => member.type === type && member.status === 'ativo');
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)] || null;
}

function resolveGangCasualties({ members = [], ownStats = null, enemyStats = null, ctLevel = 1, side = 'attacker' }) {
  const normalizedMembers = normalizeGangMembers(members);
  const losses = emptyGangLosses();

  if (!normalizedMembers.length) {
    return losses;
  }

  const localOwnStats = ownStats && typeof ownStats === 'object' ? ownStats : buildGangBattleCompositionStats(normalizedMembers);
  const localEnemyStats = enemyStats && typeof enemyStats === 'object' ? enemyStats : emptyGangStats();

  const activeMembers = normalizedMembers.filter((member) => member.status === 'ativo');
  if (!activeMembers.length) {
    return losses;
  }

  const enemyPressure = safeNumber(localEnemyStats.totalPower, 0) / Math.max(1, safeNumber(localOwnStats.totalPower, 0) + 1);
  const casualtyPressure = clamp(
    0.06 +
      enemyPressure * 0.12 +
      (side === 'attacker' ? 0.03 : 0.01) -
      safeNumber(localOwnStats.blindagem, 0) * 0.0008 -
      safeNumber(localOwnStats.folego, 0) * 0.0006,
    0.01,
    0.35
  );

  const affectedCount = clamp(
    Math.round(activeMembers.length * casualtyPressure * randomBetween(0.75, 1.1)),
    0,
    activeMembers.length
  );

  if (affectedCount <= 0) {
    return losses;
  }

  const preserveChance = clamp(
    safeNumber(localOwnStats.medicalPower, 0) * 0.003 + safeNumber(ctLevel, 1) * 0.015,
    0,
    0.65
  );

  const deathChance = clamp(
    0.28 +
      safeNumber(localEnemyStats.quebra, 0) * 0.002 -
      safeNumber(localOwnStats.medicalPower, 0) * 0.003 -
      safeNumber(ctLevel, 1) * 0.015,
    0.05,
    0.75
  );

  const mutablePool = [...activeMembers];

  for (let i = 0; i < affectedCount && mutablePool.length > 0; i += 1) {
    const index = Math.floor(Math.random() * mutablePool.length);
    const member = mutablePool.splice(index, 1)[0];

    if (!member) continue;

    const savedByMedic = Math.random() < preserveChance;
    if (!savedByMedic && Math.random() < deathChance) {
      losses.mortos[member.type] += 1;
    } else {
      losses.feridos[member.type] += 1;
      if (savedByMedic) {
        losses.preservadosPeloMedico += 1;
      }
    }
  }

  return losses;
}

function applyGangLossesToMembers(gangDoc, losses) {
  if (!gangDoc || !Array.isArray(gangDoc.members) || !losses) return;

  const now = Date.now();
  const sixHoursFromNow = new Date(now + 6 * 60 * 60 * 1000).toISOString();

  GANG_MEMBER_TYPES.forEach((type) => {
    let deathsToApply = safeNumber(losses?.mortos?.[type], 0);
    let injuriesToApply = safeNumber(losses?.feridos?.[type], 0);

    if (deathsToApply > 0) {
      gangDoc.members.forEach((member) => {
        if (
          deathsToApply > 0 &&
          member?.type === type &&
          safeString(member?.status, 'ativo') === 'ativo'
        ) {
          member.status = 'morto';
          member.injuryEndsAt = null;
          member.trainingEndsAt = null;
          member.lastBattleAt = new Date().toISOString();
          deathsToApply -= 1;
        }
      });
    }

    if (injuriesToApply > 0) {
      gangDoc.members.forEach((member) => {
        if (
          injuriesToApply > 0 &&
          member?.type === type &&
          safeString(member?.status, 'ativo') === 'ativo'
        ) {
          member.status = 'ferido';
          member.injuryEndsAt = sixHoursFromNow;
          member.trainingEndsAt = null;
          member.lastBattleAt = new Date().toISOString();
          injuriesToApply -= 1;
        }
      });
    }
  });

  gangDoc.markModified('members');
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

async function getGangCombatContext(playerId) {
  try {
    if (!playerId) {
      return { members: [], stats: emptyGangStats(), ctLevel: 1, doc: null };
    }

    const gangDoc = await GangWar.findOne({ playerId: String(playerId) });
    if (!gangDoc) {
      return { members: [], stats: emptyGangStats(), ctLevel: 1, doc: null };
    }

    const members = normalizeGangMembers(gangDoc.members || []);
    const stats = buildGangBattleCompositionStats(members);
    const ctLevel = Math.max(1, safeNumber(gangDoc?.ct?.level, 1));

    return {
      members,
      stats,
      ctLevel,
      doc: gangDoc,
    };
  } catch (error) {
    console.error('Erro ao carregar contexto da gangue no ataque:', error);
    return { members: [], stats: emptyGangStats(), ctLevel: 1, doc: null };
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

function resolveAttackMath(
  attacker,
  defender,
  attackerFaction,
  defenderFaction,
  attackerGangStats,
  defenderGangStats
) {
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

  const attackerGangPower = safeNumber(attackerGangStats?.totalPower, 0);
  const defenderGangPower = safeNumber(defenderGangStats?.totalPower, 0);

  const effectiveAttackerPower = Math.floor(
    attackerBasePower *
      (1 +
        (attackerAttackPercent * 1.0 +
          attackerAgilityPercent * 0.35 +
          attackerIntelligencePercent * 0.25 +
          attackerRespectPercent * 0.15) /
          100) +
      attackerGangPower * 0.45
  );

  const effectiveDefenderPower = Math.floor(
    defenderBasePower *
      (1 +
        (defenderDefensePercent * 1.0 +
          defenderBaseDefensePercent * 0.8 +
          defenderHpPercent * 0.4 +
          defenderAgilityPercent * 0.2 +
          defenderIntelligencePercent * 0.2) /
          100) +
      defenderGangPower * 0.45
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
            attackerIntelligencePercent * 0.0015 +
            safeNumber(attackerGangStats?.lootPower, 0) * 0.003 -
            defenderDefensePercent * 0.0015 -
            defenderBaseDefensePercent * 0.0025 -
            defenderHpPercent * 0.0015 -
            safeNumber(defenderGangStats?.blindagem, 0) * 0.001)
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
      attackerGangMembers = [],
      attackerGangStats = null,
      attackerCTLevel = 1,
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

    if (
      attacker.factionId &&
      defender.factionId &&
      String(attacker.factionId) === String(defender.factionId)
    ) {
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
    const defenderGangContext = await getGangCombatContext(defender._id);

    const normalizedAttackerGangMembers = normalizeGangMembers(attackerGangMembers);
    const normalizedAttackerGangStats =
      attackerGangStats && typeof attackerGangStats === 'object'
        ? attackerGangStats
        : buildGangBattleCompositionStats(normalizedAttackerGangMembers);

    const previewMath = resolveAttackMath(
      attacker,
      defender,
      attackerFaction,
      defenderFaction,
      normalizedAttackerGangStats,
      defenderGangContext.stats
    );

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
      attackerGangMembers: normalizedAttackerGangMembers,
      attackerGangStats: normalizedAttackerGangStats,
      attackerCTLevel: Math.max(1, safeNumber(attackerCTLevel, 1)),
      defenderGangStats: defenderGangContext.stats,
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

    if (
      attacker.factionId &&
      defender.factionId &&
      String(attacker.factionId) === String(defender.factionId)
    ) {
      return res.status(403).json({ error: 'Você não pode atacar membros da mesma facção' });
    }

    const now = Date.now();

    const attackerFaction = await getFactionCombatContext(attacker);
    const defenderFaction = await getFactionCombatContext(defender);

    const defenderGangContext = await getGangCombatContext(defender._id);
    const attackerGangMembers = normalizeGangMembers(attack.attackerGangMembers || []);
    const attackerGangStats =
      attack.attackerGangStats && typeof attack.attackerGangStats === 'object'
        ? attack.attackerGangStats
        : buildGangBattleCompositionStats(attackerGangMembers);

    const math = resolveAttackMath(
      attacker,
      defender,
      attackerFaction,
      defenderFaction,
      attackerGangStats,
      defenderGangContext.stats
    );

    const attackerGangLosses = resolveGangCasualties({
      members: attackerGangMembers,
      ownStats: attackerGangStats,
      enemyStats: defenderGangContext.stats,
      ctLevel: safeNumber(attack.attackerCTLevel, 1),
      side: 'attacker',
    });

    const defenderGangLosses = resolveGangCasualties({
      members: defenderGangContext.members,
      ownStats: defenderGangContext.stats,
      enemyStats: attackerGangStats,
      ctLevel: defenderGangContext.ctLevel,
      side: 'defender',
    });

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

    if (defenderGangContext.doc) {
      applyGangLossesToMembers(defenderGangContext.doc, defenderGangLosses);
      await defenderGangContext.doc.save();
    }
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
    attack.attackerGangStats = attackerGangStats;
    attack.defenderGangStats = defenderGangContext.stats;
    attack.attackerGangLosses = attackerGangLosses;
    attack.defenderGangLosses = defenderGangLosses;
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
      $or: [{ attackerId: String(requester._id) }, { targetId: String(requester._id) }],
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