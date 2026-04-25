import Faction from '../models/Faction.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';

function todayString() {
  return new Date().toISOString().slice(0, 10);
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

async function getFactionLaundryContext(player) {
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
    console.error('Erro ao carregar contexto de facção na lavagem:', error);
    return null;
  }
}

export async function canOperateLaundry(req, res) {
  try {
    const player = req.player;
    const businessId = Number(req.params.businessId);

    if (!Number.isFinite(businessId)) {
      return res.status(400).json({ error: 'businessId inválido' });
    }

    const dailyOperations = player.laundryProgress?.dailyOperations || [];
    const today = todayString();

    const operationsToday = dailyOperations.filter(
      (op) => Number(op.businessId) === businessId && op.date === today
    );

    const allowed = operationsToday.length < 1;

    return res.json({ allowed });
  } catch (error) {
    console.error('Erro em canOperateLaundry:', error);
    return res.status(500).json({ error: 'Erro ao verificar operação de lavagem' });
  }
}

export async function startLaundry(req, res) {
  try {
    const player = req.player;

    const {
      businessId,
      businessName,
      grossAmount,
      feePercentage,
      feeAmount,
      netAmount,
    } = req.body || {};

    if (!businessId || !businessName) {
      return res.status(400).json({ error: 'Dados da operação incompletos' });
    }

    if (player.punishments?.dirtyMoneyBlocked) {
      return res.status(403).json({ error: 'Dinheiro sujo bloqueado' });
    }

    const amount = safeNumber(grossAmount, 0);
    const fee = safeNumber(feeAmount, 0);
    const net = safeNumber(netAmount, 0);
    const feePct = safeNumber(feePercentage, 0);

    if (amount <= 0 || fee < 0 || net < 0 || feePct < 0) {
      return res.status(400).json({ error: 'Valores de lavagem inválidos' });
    }

    const dailyOperations = player.laundryProgress?.dailyOperations || [];
    const today = todayString();

    const operationsToday = dailyOperations.filter(
      (op) => Number(op.businessId) === Number(businessId) && op.date === today
    );

    if (operationsToday.length >= 1) {
      return res.status(400).json({ error: 'Você já operou neste comércio hoje' });
    }

    if ((player.balances?.dirtyMoney || 0) < amount) {
      return res.status(400).json({ error: 'Dinheiro sujo insuficiente' });
    }

    const factionContext = await getFactionLaundryContext(player);
    const cleanMoneyGainPercent = safeNumber(
      factionContext?.investmentBuffs?.cleanMoneyGainPercent,
      0
    );
    const donationEfficiencyPercent = safeNumber(
      factionContext?.investmentBuffs?.donationEfficiencyPercent,
      0
    );
    const buffDurationPercent = safeNumber(
      factionContext?.investmentBuffs?.buffDurationPercent,
      0
    );

    const operationId = `${Date.now()}-${businessId}-${player._id}`;
    const startedAt = new Date().toISOString();

    const baseDurationSeconds = 15;
    const durationReductionFactor = Math.min(0.7, buffDurationPercent / 100);
    const durationSeconds = Math.max(
      5,
      Math.round(baseDurationSeconds * (1 - durationReductionFactor))
    );

    const effectiveFeeAmount = Math.max(
      0,
      Math.floor(fee * (1 - Math.min(0.5, donationEfficiencyPercent / 100)))
    );

    const baseNetAmount = Math.max(0, Math.floor(net));
    const bonusCleanAmount = Math.max(
      0,
      Math.floor(baseNetAmount * (cleanMoneyGainPercent / 100))
    );
    const finalNetAmount = Math.max(
      0,
      Math.floor(amount - effectiveFeeAmount + bonusCleanAmount)
    );

    const endsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    player.balances.dirtyMoney -= amount;

    if (!player.laundryProgress) {
      player.laundryProgress = {
        activeOperations: [],
        dailyOperations: [],
      };
    }

    if (!Array.isArray(player.laundryProgress.activeOperations)) {
      player.laundryProgress.activeOperations = [];
    }

    if (!Array.isArray(player.laundryProgress.dailyOperations)) {
      player.laundryProgress.dailyOperations = [];
    }

    player.laundryProgress.activeOperations.push({
      id: operationId,
      operationId,
      businessId: Number(businessId),
      businessName: String(businessName),
      startedAt,
      endsAt,
      grossAmount: amount,
      feePercentage: feePct,
      feeAmount: effectiveFeeAmount,
      originalFeeAmount: fee,
      originalNetAmount: baseNetAmount,
      factionCleanMoneyGainPercent: cleanMoneyGainPercent,
      factionDonationEfficiencyPercent: donationEfficiencyPercent,
      factionBuffDurationPercent: buffDurationPercent,
      bonusCleanAmount,
      netAmount: finalNetAmount,
      durationSeconds,
      status: 'processing',
    });

    player.laundryProgress.dailyOperations.push({
      businessId: Number(businessId),
      date: today,
      amount,
    });

    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.status(201).json({
      operationId,
      endsAt,
      durationSeconds,
      factionBuffs: factionContext
        ? {
            factionId: factionContext.factionId,
            factionName: factionContext.factionName,
            factionTag: factionContext.factionTag,
            investmentBuffs: factionContext.investmentBuffs,
          }
        : null,
      laundrySummary: {
        grossAmount: amount,
        originalFeeAmount: fee,
        effectiveFeeAmount,
        originalNetAmount: baseNetAmount,
        bonusCleanAmount,
        finalNetAmount,
      },
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro em startLaundry:', error);
    return res.status(500).json({ error: 'Erro ao iniciar lavagem' });
  }
}

export async function completeLaundry(req, res) {
  try {
    const player = req.player;
    const { operationId } = req.body || {};

    if (!operationId) {
      return res.status(400).json({ error: 'operationId é obrigatório' });
    }

    const activeOperations = player.laundryProgress?.activeOperations || [];
    const operation = activeOperations.find(
      (op) => op.operationId === operationId && op.status === 'processing'
    );

    if (!operation) {
      return res.status(404).json({ error: 'Operação não encontrada' });
    }

    const endsAtTime = new Date(operation.endsAt).getTime();
    if (Date.now() < endsAtTime) {
      return res.status(400).json({ error: 'Operação ainda em andamento' });
    }

    operation.status = 'completed';
    player.balances.cleanMoney += safeNumber(operation.netAmount, 0);

    player.laundryProgress.activeOperations =
      player.laundryProgress.activeOperations.filter(
        (op) => !(op.operationId === operationId && op.status === 'completed')
      );

    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({
      completedOperation: {
        operationId,
        grossAmount: safeNumber(operation.grossAmount, 0),
        finalNetAmount: safeNumber(operation.netAmount, 0),
        bonusCleanAmount: safeNumber(operation.bonusCleanAmount, 0),
        factionCleanMoneyGainPercent: safeNumber(operation.factionCleanMoneyGainPercent, 0),
        factionDonationEfficiencyPercent: safeNumber(operation.factionDonationEfficiencyPercent, 0),
        factionBuffDurationPercent: safeNumber(operation.factionBuffDurationPercent, 0),
      },
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro em completeLaundry:', error);
    return res.status(500).json({ error: 'Erro ao concluir lavagem' });
  }
}