import Faction from '../models/Faction.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { applyPassiveIncome, bumpVersion } from '../utils/gameHelpers.js';

const ALLOWED_MULTIPLIERS = [1, 2, 5, 10, 25, 50];

function randomFrom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
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

async function getFactionBuffsForPlayer(player) {
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
        activeBuffs: 1,
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
      activeBuffs: Array.isArray(faction.activeBuffs) ? faction.activeBuffs : [],
    };
  } catch (error) {
    console.error('Erro ao carregar buffs de facção no gameController:', error);
    return null;
  }
}

function resolveSlotSpin() {
  const pool = ['money', 'money', 'money', 'gun', 'gun', 'diamond', 'police'];
  const reels = [randomFrom(pool), randomFrom(pool), randomFrom(pool)];

  const counts = reels.reduce((acc, symbol) => {
    acc[symbol] = (acc[symbol] || 0) + 1;
    return acc;
  }, {});

  const triple = Object.entries(counts).find(([, qty]) => qty === 3)?.[0] || null;
  const double = Object.entries(counts).find(([, qty]) => qty === 2)?.[0] || null;

  if (triple === 'police') {
    return {
      reels,
      dirtyGain: 0,
      prison: true,
      doublePolice: false,
      label: 'RODOU',
    };
  }

  if (triple === 'diamond') {
    return {
      reels,
      dirtyGain: 10000,
      prison: false,
      doublePolice: false,
      label: 'JACKPOT',
    };
  }

  if (triple === 'money') {
    return {
      reels,
      dirtyGain: 2500,
      prison: false,
      doublePolice: false,
      label: 'TRIPLO MONEY',
    };
  }

  if (triple === 'gun') {
    return {
      reels,
      dirtyGain: 1600,
      prison: false,
      doublePolice: false,
      label: 'TRIPLO ARSENAL',
    };
  }

  if (double === 'police') {
    return {
      reels,
      dirtyGain: 0,
      prison: false,
      doublePolice: true,
      label: 'BLITZ',
    };
  }

  if (double === 'diamond') {
    return {
      reels,
      dirtyGain: 1200,
      prison: false,
      doublePolice: false,
      label: 'DUPLO DIAMANTE',
    };
  }

  if (double === 'money') {
    return {
      reels,
      dirtyGain: 600,
      prison: false,
      doublePolice: false,
      label: 'DUPLO MONEY',
    };
  }

  if (double === 'gun') {
    return {
      reels,
      dirtyGain: 450,
      prison: false,
      doublePolice: false,
      label: 'DUPLO ARSENAL',
    };
  }

  return {
    reels,
    dirtyGain: 120,
    prison: false,
    doublePolice: false,
    label: 'CORRE DE RUA',
  };
}

export async function gameAction(req, res) {
  try {
    const player = req.player;
    const { action, data } = req.body || {};

    if (!action) {
      return res.status(400).json({ error: 'Ação ausente' });
    }

    applyPassiveIncome(player);

    if (action === 'spin_slot') {
      const multiplier = Number(data?.multiplier || 1);

      if (!ALLOWED_MULTIPLIERS.includes(multiplier)) {
        return res.status(400).json({ error: 'Multiplicador inválido' });
      }

      if (player.punishments?.levelProgressionBlocked) {
        return res.status(403).json({ error: 'Jogador bloqueado para progresso' });
      }

      const now = Date.now();
      if (player.lastSpinAt && now - player.lastSpinAt < 800) {
        return res.status(429).json({ error: 'Espere um pouco antes de girar novamente' });
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

      const result = resolveSlotSpin();

      let finalDirtyGain = 0;

      if (result.prison) {
        const loss = Math.floor((player.balances.dirtyMoney || 0) * 0.3);
        player.balances.dirtyMoney = Math.max(0, player.balances.dirtyMoney - loss);
      } else {
        const baseGain = Math.floor(result.dirtyGain * multiplier);
        finalDirtyGain = Math.floor(baseGain * (1 + factionDirtyBonusPercent / 100));
        player.balances.dirtyMoney += finalDirtyGain;
      }

      bumpVersion(player);
      await player.save();

      return res.json({
        result: {
          ...result,
          dirtyGain: finalDirtyGain,
          baseDirtyGain: result.prison ? 0 : Math.floor(result.dirtyGain * multiplier),
          factionDirtyBonusPercent,
        },
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

    return res.status(400).json({ error: 'Ação de jogo desconhecida' });
  } catch (error) {
    console.error('Erro em gameAction:', error);
    return res.status(500).json({ error: 'Erro ao processar ação do jogo' });
  }
}