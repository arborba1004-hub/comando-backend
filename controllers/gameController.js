import Faction from '../models/Faction.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { applyPassiveIncome, bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { ECONOMY } from '../config/economyConfig.js';
import { addCardToCollection, drawRandomGiroCard } from '../data/giroCardCatalog.js';

const ALLOWED_MULTIPLIERS = ECONOMY.GIRO.multipliers;
const SYMBOLS_BY_OUTCOME = Object.freeze({
  jackpot: ['diamond', 'diamond', 'diamond'],
  big: ['gun', 'gun', 'gun'],
  medium: ['money', 'money', 'money'],
  small: ['money', 'money', 'diamond'],
  common: ['money', 'gun', 'diamond'],
  prison: ['police', 'police', 'police'],
});

function shuffleReels(reels) {
  const copy = [...reels];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey() {
  return todayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
}

function weightedPick(entries) {
  const total = entries.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
  if (total <= 0) return entries[0]?.value ?? 'common';
  let roll = Math.random() * total;
  for (const item of entries) {
    roll -= Math.max(0, Number(item.weight) || 0);
    if (roll <= 0) return item.value;
  }
  return entries[entries.length - 1]?.value ?? 'common';
}

function ensureEconomyState(player) {
  if (!player.balances) player.balances = { corre: 0, dirtyMoney: 0, cleanMoney: 0 };
  if (!player.dailyCorre) player.dailyCorre = { streak: 0, lastClaimDate: '', totalClaims: 0 };
  if (!player.prisonHistory) {
    player.prisonHistory = { windowStart: 0, countInWindow: 0, lastPrisonAt: 0, cooldownUntil: 0 };
  }
  if (!player.spinRateLimit) player.spinRateLimit = { windowStart: 0, spinCount: 0 };
  if (!player.cardCollection) {
    player.cardCollection = {
      cards: [],
      completedSets: [],
      totalCardsCollected: 0,
      chests: { common: 0, rare: 0, epic: 0 },
    };
  }
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

async function getFactionBuffsForPlayer(player) {
  try {
    if (!player?.factionId) return null;

    const faction = await Faction.findOne(
      { id: String(player.factionId) },
      { id: 1, name: 1, tag: 1, investments: 1, investmentBuffs: 1, activeBuffs: 1 }
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
      factionId: String(faction.id),
      factionName: String(faction.name || ''),
      factionTag: String(faction.tag || ''),
      investmentBuffs,
      activeBuffs: Array.isArray(faction.activeBuffs) ? faction.activeBuffs : [],
    };
  } catch (error) {
    console.error('Erro ao carregar buffs de facção no gameController:', error);
    return null;
  }
}

function applySpinRateLimit(player, now) {
  const cfg = ECONOMY.GIRO;
  const lastSpinAt = Number(player.lastSpinAt || 0);

  if (lastSpinAt && now - lastSpinAt < cfg.minSpinIntervalMs) {
    return {
      ok: false,
      status: 429,
      error: 'Devagar, parceiro. Espera um tiquinho.',
      retryAfter: cfg.minSpinIntervalMs - (now - lastSpinAt),
    };
  }

  const windowStart = Number(player.spinRateLimit?.windowStart || 0);
  const spinCount = Number(player.spinRateLimit?.spinCount || 0);

  if (windowStart && now - windowStart < cfg.rateWindowMs) {
    if (spinCount >= cfg.maxSpinsPerWindow) {
      return {
        ok: false,
        status: 429,
        error: 'Muitos corres seguidos. Respira antes de chamar atenção.',
        retryAfter: cfg.rateWindowMs - (now - windowStart),
      };
    }
    player.spinRateLimit.spinCount = spinCount + 1;
  } else {
    player.spinRateLimit.windowStart = now;
    player.spinRateLimit.spinCount = 1;
  }

  return { ok: true };
}

function resolveSlotSpin(multiplier) {
  const risk = ECONOMY.GIRO.multiplierRisk[multiplier] || ECONOMY.GIRO.multiplierRisk[1];
  const weights = ECONOMY.GIRO.outcomeWeights;
  const outcome = weightedPick([
    { value: 'jackpot', weight: weights.jackpot },
    { value: 'big', weight: weights.big },
    { value: 'medium', weight: weights.medium },
    { value: 'small', weight: weights.small },
    { value: 'common', weight: weights.common },
    { value: 'prison', weight: weights.prison + risk.extraPrisonWeight },
  ]);

  const rewardByOutcome = {
    jackpot: ECONOMY.GIRO.baseRewards.jackpot,
    big: ECONOMY.GIRO.baseRewards.big,
    medium: ECONOMY.GIRO.baseRewards.medium,
    small: ECONOMY.GIRO.baseRewards.small,
    common: ECONOMY.GIRO.baseRewards.common,
    prison: 0,
  };

  const labels = {
    jackpot: 'JACKPOT DO ASFALTO',
    big: 'TRIPLO ARSENAL',
    medium: 'TRIPLO MONEY',
    small: 'DUPLO CORRE',
    common: 'CORRE DE RUA',
    prison: 'RODOU NA BLITZ',
  };

  const reels = shuffleReels(SYMBOLS_BY_OUTCOME[outcome] || SYMBOLS_BY_OUTCOME.common);

  return {
    reels,
    outcome,
    dirtyGain: rewardByOutcome[outcome] || 0,
    prison: outcome === 'prison',
    doublePolice: false,
    label: labels[outcome] || 'CORRE DE RUA',
    riskPercent: risk.riskPercent,
    riskLabel: risk.label,
  };
}

function getFugaVehicleItems(player = {}) {
  const items = Array.isArray(player?.inventory?.items) ? player.inventory.items : [];
  return items.filter((item) => item?.category === 'fuga_vehicle' || (item?.source === 'fuga' && (item?.vehicleId || item?.category === 'vehicle')));
}

function getFugaProtectionPercent(player = {}) {
  const ownedCount = Array.isArray(player?.ownedVehicles) ? player.ownedVehicles.length : 0;
  const bestLevel = getFugaVehicleItems(player).reduce((max, item) => {
    const level = Math.max(1, Math.min(100, Math.floor(safeNumber(item?.level, 1))));
    return Math.max(max, level);
  }, 0);

  // A fuga reduz perda e cooldown, mas nunca zera a consequência da blitz.
  return Math.min(55, Math.round((bestLevel * 0.45 + ownedCount * 1.25) * 10) / 10);
}

function applyPrisonPenalty(player, now) {
  const cfg = ECONOMY.GIRO.prison;
  const history = player.prisonHistory || {};

  if (!history.windowStart || now - Number(history.windowStart || 0) > cfg.windowMs) {
    player.prisonHistory = {
      windowStart: now,
      countInWindow: 1,
      lastPrisonAt: now,
      cooldownUntil: 0,
    };
  } else {
    player.prisonHistory.countInWindow = Number(history.countInWindow || 0) + 1;
    player.prisonHistory.lastPrisonAt = now;
  }

  const count = Math.max(1, Number(player.prisonHistory.countInWindow || 1));
  const baseLossPct = Math.min(cfg.maxLossPct, cfg.baseLossPct + Math.max(0, count - 1) * cfg.lossStepPct);
  const baseCooldownMs = cfg.cooldownsMs[Math.min(count, cfg.cooldownsMs.length - 1)] || 0;
  const fugaProtectionPercent = getFugaProtectionPercent(player);
  const fugaMultiplier = Math.max(0.35, 1 - fugaProtectionPercent / 100);
  const lossPct = Number((baseLossPct * fugaMultiplier).toFixed(4));
  const loss = Math.floor(Math.max(0, Number(player.balances?.dirtyMoney || 0)) * lossPct);
  const cooldownMs = Math.max(0, Math.round(baseCooldownMs * fugaMultiplier));

  player.balances.dirtyMoney = Math.max(0, Number(player.balances?.dirtyMoney || 0) - loss);
  player.prisonHistory.cooldownUntil = now + cooldownMs;

  return {
    loss,
    lossPct,
    baseLossPct,
    cooldownMs,
    baseCooldownMs,
    fugaProtectionPercent,
    cooldownUntil: player.prisonHistory.cooldownUntil,
    prisonCountInWindow: count,
  };
}

function maybeDropCard(player, result) {
  if (result.prison) return null;

  const cfg = ECONOMY.GIRO.cardDrop;
  let chance = cfg.commonChance;
  let preferredRarity = null;

  if (result.outcome === 'big') {
    chance = cfg.rareChanceOnBig;
    preferredRarity = Math.random() < 0.5 ? 'rare' : null;
  }
  if (result.outcome === 'jackpot') {
    chance = cfg.rareChanceOnJackpot;
    preferredRarity = Math.random() < 0.65 ? 'epic' : 'rare';
  }

  if (Math.random() > chance) return null;
  const card = drawRandomGiroCard(preferredRarity);
  return addCardToCollection(player, card);
}

function applyDailyCorreReward(player) {
  ensureEconomyState(player);
  const today = todayKey();
  const yesterday = yesterdayKey();

  if (player.dailyCorre.lastClaimDate === today) {
    return { ok: false, error: 'Corre diário já foi resgatado hoje' };
  }

  const wasStreak = player.dailyCorre.lastClaimDate === yesterday;
  const nextStreak = wasStreak ? Number(player.dailyCorre.streak || 0) + 1 : 1;
  const reward = ECONOMY.CORRE.dailyRewards[(nextStreak - 1) % ECONOMY.CORRE.dailyRewards.length];

  player.dailyCorre.streak = nextStreak;
  player.dailyCorre.lastClaimDate = today;
  player.dailyCorre.totalClaims = Number(player.dailyCorre.totalClaims || 0) + 1;

  player.balances.corre = Math.max(0, Number(player.balances.corre || 0)) + reward.corre;
  player.balances.dirtyMoney = Math.max(0, Number(player.balances.dirtyMoney || 0)) + reward.dirtyMoney;
  player.balances.cleanMoney = Math.max(0, Number(player.balances.cleanMoney || 0)) + reward.cleanMoney;

  let cardDrop = null;
  if (reward.chest) {
    if (!player.cardCollection.chests) player.cardCollection.chests = { common: 0, rare: 0, epic: 0 };
    player.cardCollection.chests[reward.chest] = Number(player.cardCollection.chests[reward.chest] || 0) + 1;
    cardDrop = addCardToCollection(
      player,
      drawRandomGiroCard(reward.chest === 'rare' ? 'rare' : null)
    );
  }

  return { ok: true, reward, streak: nextStreak, cardDrop };
}

function publicEconomyConfig() {
  return {
    corre: {
      regenPerHour: ECONOMY.CORRE.regenPerHour,
      regenSoftCap: ECONOMY.CORRE.regenSoftCap,
      dailyRewards: ECONOMY.CORRE.dailyRewards,
      factionRequestAmount: ECONOMY.CORRE.factionRequestAmount,
      factionDonationPerMember: ECONOMY.CORRE.factionDonationPerMember,
    },
    giro: {
      multipliers: ECONOMY.GIRO.multipliers,
      multiplierRisk: ECONOMY.GIRO.multiplierRisk,
      baseRewards: ECONOMY.GIRO.baseRewards,
    },
  };
}

export async function gameAction(req, res) {
  try {
    const player = req.player;
    const { action, data } = req.body || {};

    if (!action) {
      return res.status(400).json({ error: 'Ação ausente' });
    }

    ensureEconomyState(player);
    applyPassiveIncome(player);

    if (action === 'claim_daily_corre') {
      const claim = applyDailyCorreReward(player);
      if (!claim.ok) {
        return res.status(400).json({ error: claim.error });
      }

      bumpVersion(player);
      await player.save();
      emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

      return res.json({
        ok: true,
        reward: claim.reward,
        streak: claim.streak,
        cardDrop: claim.cardDrop,
        economy: publicEconomyConfig(),
        player: mergePlayerState(player.toObject()),
      });
    }

    if (action === 'spin_slot') {
      const multiplier = Number(data?.multiplier || 1);

      if (!ALLOWED_MULTIPLIERS.includes(multiplier)) {
        return res.status(400).json({ error: 'Multiplicador inválido' });
      }

      if (player.punishments?.levelProgressionBlocked) {
        return res.status(403).json({ error: 'Jogador bloqueado para progresso' });
      }

      const now = Date.now();
      const cooldownUntil = Number(player.prisonHistory?.cooldownUntil || 0);
      if (cooldownUntil > now) {
        return res.status(429).json({
          error: 'Corre esfriando depois da blitz.',
          retryAfter: cooldownUntil - now,
          cooldownUntil,
        });
      }

      const rate = applySpinRateLimit(player, now);
      if (!rate.ok) {
        return res.status(rate.status).json({
          error: rate.error,
          retryAfter: rate.retryAfter,
        });
      }

      const correCost = multiplier;
      if ((player.balances?.corre || 0) < correCost) {
        return res.status(400).json({ error: 'Corre insuficiente' });
      }

      const factionContext = await getFactionBuffsForPlayer(player);
      const factionDirtyBonusPercent = safeNumber(
        factionContext?.investmentBuffs?.dirtyMoneyGainPercent,
        0
      );

      player.balances.corre -= correCost;
      player.lastSpinAt = now;

      const result = resolveSlotSpin(multiplier);

      let finalDirtyGain = 0;
      let baseDirtyGain = 0;
      let prisonPenalty = null;
      let cardDrop = null;

      if (result.prison) {
        prisonPenalty = applyPrisonPenalty(player, now);
        result.label = `${result.label} — perdeu ${Math.round(prisonPenalty.lossPct * 100)}% do Commands Sujo`;
      } else {
        baseDirtyGain = Math.floor(result.dirtyGain * multiplier);
        finalDirtyGain = Math.floor(baseDirtyGain * (1 + factionDirtyBonusPercent / 100));
        player.balances.dirtyMoney += finalDirtyGain;
        cardDrop = maybeDropCard(player, result);
      }

      bumpVersion(player);
      await player.save();
      emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

      return res.json({
        result: {
          ...result,
          dirtyGain: finalDirtyGain,
          baseDirtyGain,
          factionDirtyBonusPercent,
          correCost,
          multiplier,
          prisonPenalty,
          cardDrop,
          cooldownUntil: player.prisonHistory?.cooldownUntil || 0,
        },
        economy: publicEconomyConfig(),
        factionBuffs: factionContext
          ? {
              factionId: factionContext.factionId,
              factionName: factionContext.factionName,
              factionTag: factionContext.factionTag,
              investmentBuffs: factionContext.investmentBuffs,
            }
          : null,
        player: mergePlayerState(player.toObject()),
      });
    }

    if (action === 'get_giro_state') {
      return res.json({
        ok: true,
        economy: publicEconomyConfig(),
        player: mergePlayerState(player.toObject()),
      });
    }

    return res.status(400).json({ error: 'Ação de jogo desconhecida' });
  } catch (error) {
    console.error('Erro em gameAction:', error);
    return res.status(500).json({ error: 'Erro ao processar ação do jogo' });
  }
}
