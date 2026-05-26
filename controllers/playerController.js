import { emitToPlayer } from '../services/socketEmitter.js';
import { syncBarracoGangStatBonus } from '../services/gangStatisticsService.js';
import Faction from '../models/Faction.js';
import { mergePlayerState, sanitizePlayerState } from '../utils/playerMapper.js';
import {
  applyPassiveIncome,
  bumpVersion,
  calculatePlayerPower,
} from '../utils/gameHelpers.js';

const ALLOWED_TOP_LEVEL_FIELDS = [
  'hp',
  'inventory',
  'skills',
  'vip',
  'lastSkillTrainAt',
  'lastAttackAt',
  'hierarchyBadge',
  'barracoPosition',
  'mapPosition',
  'laundryProgress',
  'punishments',
  'skillBoostMultiplier',
  'headerCustomization',
  'ownedVehicles',
  'purchasedAccessories',
  'accessories',
  'notifications',
  'attackHistory',
  'factionId',
  'gangId',
  'gang',
];

// Campos controlados por sistemas oficiais do backend.
// Eles são ignorados em /player/update para impedir adulteração direta do barraco/economia.
const SERVER_CONTROLLED_FIELDS = new Set([
  'niveis',
  'balances',
  'pageLevels',
]);

function pickAllowedFields(payload = {}) {
  const safe = {};

  for (const [field, value] of Object.entries(payload)) {
    if (SERVER_CONTROLLED_FIELDS.has(field)) continue;
    if (ALLOWED_TOP_LEVEL_FIELDS.includes(field)) {
      safe[field] = value;
    }
  }

  return safe;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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

async function getFactionContextForPlayer(player) {
  try {
    if (!player?.factionId) return null;

    const faction = await Faction.findOne(
      { id: String(player.factionId) },
      {
        id: 1,
        name: 1,
        tag: 1,
        level: 1,
        exp: 1,
        expToNext: 1,
        investments: 1,
        investmentBuffs: 1,
        activeBuffs: 1,
        totalInvestmentLevel: 1,
        investmentTierName: 1,
        treasury: 1,
      }
    ).lean();

    if (!faction) return null;

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
      id: String(faction.id),
      name: String(faction.name || ''),
      tag: String(faction.tag || ''),
      level: Math.max(1, safeNumber(faction.level, 1)),
      exp: Math.max(0, safeNumber(faction.exp, 0)),
      expToNext: Math.max(1, safeNumber(faction.expToNext, 100)),
      totalInvestmentLevel: Math.max(0, safeNumber(faction.totalInvestmentLevel, 0)),
      investmentTierName: String(faction.investmentTierName || 'Turma de Esquina'),
      treasury: {
        dirtyMoney: Math.max(0, safeNumber(faction.treasury?.dirtyMoney, 0)),
        cleanMoney: Math.max(0, safeNumber(faction.treasury?.cleanMoney, 0)),
        corre: Math.max(0, safeNumber(faction.treasury?.corre, 0)),
      },
      investmentBuffs,
      activeBuffs: Array.isArray(faction.activeBuffs) ? faction.activeBuffs : [],
    };
  } catch (error) {
    console.error('Erro ao carregar contexto de facção em /player/me:', error);
    return null;
  }
}

export async function getMe(req, res) {
  try {
    const player = req.player;
    const barracoBonusSync = syncBarracoGangStatBonus(player);
    if (barracoBonusSync.changed) {
      bumpVersion(player);
      await player.save();
    }

    const playerView = player.toObject();

    applyPassiveIncome(playerView);

    const recalculatedPower = calculatePlayerPower(playerView);
    playerView.power = recalculatedPower;

    const faction = await getFactionContextForPlayer(player);

    return res.json({
      player: mergePlayerState(playerView),
      faction,
    });
  } catch (error) {
    console.error('Erro em /player/me:', error);
    return res.status(500).json({ error: 'Erro ao buscar player' });
  }
}

export async function updateMe(req, res) {
  try {
    const player = req.player;
    const incoming = req.body || {};

    const allowedIncoming = pickAllowedFields(incoming);

    const mergedSkills = {
      ...(player.toObject().skills || {}),
      ...(allowedIncoming.skills || {}),
    };

    const mergedInventory = {
      ...(player.toObject().inventory || {}),
      ...(allowedIncoming.inventory || {}),
      items: allowedIncoming.inventory?.items ?? player.inventory?.items ?? [],
      gifts: allowedIncoming.inventory?.gifts ?? player.inventory?.gifts ?? [],
      rewards: allowedIncoming.inventory?.rewards ?? player.inventory?.rewards ?? [],
    };

    const mergedNiveis = {
      ...(player.toObject().niveis || {}),
      ...(allowedIncoming.niveis || {}),
    };

    const merged = mergePlayerState({
      ...player.toObject(),
      ...allowedIncoming,
      balances: {
        ...(player.toObject().balances || {}),
        ...(allowedIncoming.balances || {}),
      },
      niveis: mergedNiveis,
      skills: mergedSkills,
      inventory: mergedInventory,
      pageLevels: {
        ...(player.toObject().pageLevels || {}),
        ...(allowedIncoming.pageLevels || {}),
      },
      barracoPosition: {
        ...(player.toObject().barracoPosition || {}),
        ...(allowedIncoming.barracoPosition || {}),
      },
      mapPosition: {
        ...(player.toObject().mapPosition || {}),
        ...(allowedIncoming.mapPosition || {}),
      },
      laundryProgress: {
        ...(player.toObject().laundryProgress || {}),
        ...(allowedIncoming.laundryProgress || {}),
      },
      punishments: {
        ...(player.toObject().punishments || {}),
        ...(allowedIncoming.punishments || {}),
        delacao: {
          ...(player.toObject().punishments?.delacao || {}),
          ...(allowedIncoming.punishments?.delacao || {}),
        },
      },
      headerCustomization: {
        ...(player.toObject().headerCustomization || {}),
        ...(allowedIncoming.headerCustomization || {}),
      },
      accessories: {
        ...(player.toObject().accessories || {}),
        ...(allowedIncoming.accessories || {}),
      },
      gang: {
        ...(player.toObject().gang || {}),
        ...(allowedIncoming.gang || {}),
        members: Array.isArray(allowedIncoming.gang?.members)
          ? allowedIncoming.gang.members
          : player.toObject().gang?.members || [],
      },
    });

    merged.power = calculatePlayerPower(merged);

    const sanitized = sanitizePlayerState(merged);

    Object.assign(player, sanitized);
    bumpVersion(player);
    await player.save();

    const faction = await getFactionContextForPlayer(player);
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()), faction });

    return res.json({
      player: mergePlayerState(player.toObject()),
      faction,
    });
  } catch (error) {
    console.error('Erro em /player/update:', error);
    return res.status(500).json({ error: 'Erro ao atualizar player' });
  }
}