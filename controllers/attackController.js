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
import {
  buildGangBattleStatsWithFormation,
  resolveGangCasualties as resolveOfficialGangCasualties,
} from '../services/gangWarService.js';

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

async function applyLossesToGangDoc(gangDoc, losses) {
  if (!gangDoc || !losses) return false;
  applyGangLossesToMembers(gangDoc, losses);
  await gangDoc.save();
  return true;
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
            dirtyMoneyGainPercent: safeNumber(
              faction.investmentBuffs.dirtyMoneyGainPercent,
              0
            ),
            cleanMoneyGainPercent: safeNumber(
              faction.investmentBuffs.cleanMoneyGainPercent,
              0
            ),
            agilityPercent: safeNumber(faction.investmentBuffs.agilityPercent, 0),
            intelligencePercent: safeNumber(
              faction.investmentBuffs.intelligencePercent,
              0
            ),
            respectPercent: safeNumber(faction.investmentBuffs.respectPercent, 0),
            baseDefensePercent: safeNumber(
              faction.investmentBuffs.baseDefensePercent,
              0
            ),
            donationEfficiencyPercent: safeNumber(
              faction.investmentBuffs.donationEfficiencyPercent,
              0
            ),
            buffDurationPercent: safeNumber(
              faction.investmentBuffs.buffDurationPercent,
              0
            ),
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
      return {
        members: [],
        stats: emptyGangStats(),
        ctLevel: 1,
        formation: 'pressao_total',
        doc: null,
      };
    }

    const gangDoc = await GangWar.findOne({ playerId });
    if (!gangDoc) {
      return {
        members: [],
        stats: emptyGangStats(),
        ctLevel: 1,
        formation: 'pressao_total',
        doc: null,
      };
    }

    const members = normalizeGangMembers(gangDoc.members || []);
    const formation = gangDoc.formation || 'pressao_total';
    const stats = buildGangBattleStatsWithFormation(members, formation);
    const ctLevel = Math.max(1, safeNumber(gangDoc?.ct?.level, 1));

    return {
      members,
      stats,
      ctLevel,
      formation,
      doc: gangDoc,
    };
  } catch (error) {
    console.error('Erro ao carregar contexto da gangue no ataque:', error);
    return {
      members: [],
      stats: emptyGangStats(),
      ctLevel: 1,
      formation: 'pressao_total',
      doc: null,
    };
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
