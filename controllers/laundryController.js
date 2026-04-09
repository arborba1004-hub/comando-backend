import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion } from '../utils/gameHelpers.js';

function todayString() {
  return new Date().toISOString().slice(0, 10);
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

    // regra atual do jogo: 1 operação por comércio por dia
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

    const amount = Number(grossAmount || 0);
    const fee = Number(feeAmount || 0);
    const net = Number(netAmount || 0);
    const feePct = Number(feePercentage || 0);

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

    const operationId = `${Date.now()}-${businessId}-${player._id}`;
    const startedAt = new Date().toISOString();
    const durationSeconds = 15;
    const endsAt = new Date(Date.now() + durationSeconds * 1000).toISOString();

    player.balances.dirtyMoney -= amount;

    player.laundryProgress.activeOperations.push({
      id: operationId,
      operationId,
      businessId: Number(businessId),
      businessName: String(businessName),
      startedAt,
      endsAt,
      grossAmount: amount,
      feePercentage: feePct,
      feeAmount: fee,
      netAmount: net,
      status: 'processing',
    });

    player.laundryProgress.dailyOperations.push({
      businessId: Number(businessId),
      date: today,
      amount,
    });

    bumpVersion(player);
    await player.save();

    return res.status(201).json({
      operationId,
      endsAt,
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
    player.balances.cleanMoney += Number(operation.netAmount || 0);

    // limpa operações concluídas da lista ativa
    player.laundryProgress.activeOperations =
      player.laundryProgress.activeOperations.filter(
        (op) => !(op.operationId === operationId && op.status === 'completed')
      );

    bumpVersion(player);
    await player.save();

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro em completeLaundry:', error);
    return res.status(500).json({ error: 'Erro ao concluir lavagem' });
  }
}