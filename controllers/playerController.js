import { emitToPlayer } from '../services/socketEmitter.js';
import { syncBarracoGangStatBonus } from '../services/gangStatisticsService.js';
import Faction from '../models/Faction.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import {
  applyPassiveIncome,
  bumpVersion,
  calculatePlayerPower,
} from '../utils/gameHelpers.js';


// /player/update agora é deliberadamente estreito.
// Ele existe só para customização visual do perfil (nome/avatar/cabeçalho).
// Economia, inventário, gangue, mapa, facção, histórico, VIP e punições devem
// passar apenas por endpoints oficiais do backend.
const ALLOWED_PROFILE_FIELDS = new Set(['headerCustomization']);

const SERVER_CONTROLLED_FIELDS = new Set([
  'niveis',
  'balances',
  'pageLevels',
  'barracoUpgrade',
  'barracoAccelerators',
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
  'ownedVehicles',
  'purchasedAccessories',
  'accessories',
  'notifications',
  'attackHistory',
  'factionId',
  'gangId',
  'gang',
  'gangMembers',
  'gangStats',
  'power',
  'battlePrestige',
  'dailyCorre',
  'prisonHistory',
  'spinRateLimit',
  'cardCollection',
  'pvpProtectionUntil',
  'currentRank',
  'unlockedRanks',
]);

function sanitizeString(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function sanitizeHeaderCustomization(value = {}, current = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const next = { ...(current || {}) };

  if (Object.prototype.hasOwnProperty.call(value, 'playerNameFont')) {
    next.playerNameFont = sanitizeString(value.playerNameFont, 40) || current?.playerNameFont || 'oswald';
  }

  if (Object.prototype.hasOwnProperty.call(value, 'playerNameFontSize')) {
    next.playerNameFontSize = sanitizeString(value.playerNameFontSize, 32) || current?.playerNameFontSize || '1.875rem';
  }

  if (Object.prototype.hasOwnProperty.call(value, 'playerNameColor')) {
    next.playerNameColor = sanitizeString(value.playerNameColor, 32) || current?.playerNameColor || '#ffffff';
  }

  if (Object.prototype.hasOwnProperty.call(value, 'customName')) {
    next.customName = sanitizeString(value.customName, 30);
  }

  if (Object.prototype.hasOwnProperty.call(value, 'customAvatar')) {
    const avatar = typeof value.customAvatar === 'string' ? value.customAvatar : '';
    // Aceita URLs HTTPS, assets Wix e data URL de imagem comprimida pelo frontend.
    // Limite evita payload gigante em /player/update.
    if (
      avatar === '' ||
      ((avatar.startsWith('https://') || avatar.startsWith('data:image/')) && avatar.length <= 250_000)
    ) {
      next.customAvatar = avatar;
    }
  }

  return next;
}

function pickAllowedFields(payload = {}, currentPlayer = {}) {
  const safe = {};
  const ignored = [];

  for (const [field, value] of Object.entries(payload || {})) {
    if (ALLOWED_PROFILE_FIELDS.has(field)) {
      if (field === 'headerCustomization') {
        const sanitized = sanitizeHeaderCustomization(value, currentPlayer.headerCustomization || {});
        if (sanitized) safe.headerCustomization = sanitized;
      }
      continue;
    }

    // Campos sensíveis são ignorados sem erro para manter compatibilidade com clients antigos,
    // mas não são persistidos de forma alguma.
    if (SERVER_CONTROLLED_FIELDS.has(field) || field !== 'headerCustomization') {
      ignored.push(field);
    }
  }

  return { safe, ignored };
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
    const current = player.toObject();

    const { safe: allowedIncoming, ignored } = pickAllowedFields(incoming, current);

    if (allowedIncoming.headerCustomization) {
      player.headerCustomization = {
        ...(current.headerCustomization || {}),
        ...allowedIncoming.headerCustomization,
      };
      if (typeof player.markModified === 'function') player.markModified('headerCustomization');
    }

    bumpVersion(player);
    await player.save();

    const faction = await getFactionContextForPlayer(player);
    const mappedPlayer = mergePlayerState(player.toObject());

    emitToPlayer(String(player._id), 'playerUpdate', { player: mappedPlayer, faction });

    return res.json({
      player: mappedPlayer,
      faction,
      ignoredFields: ignored,
      message: ignored.length
        ? 'Campos sensíveis ignorados. Use os endpoints oficiais do backend para economia, mapa, gangue, inventário, histórico, VIP e punições.'
        : undefined,
    });
  } catch (error) {
    console.error('Erro em /player/update:', error);
    return res.status(500).json({ error: 'Erro ao atualizar player' });
  }
}
