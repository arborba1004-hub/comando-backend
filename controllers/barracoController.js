import Player from '../models/Player.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion, calculatePlayerPower } from '../utils/gameHelpers.js';
import {
  buildBarracoUpgradeOperation,
  formatDurationMs,
  getBarracoName,
  getBarracoUpgradeRequirements,
  getBarracoUpgradeStatus,
  getBarracoUpgradeDurationMs,
  MAX_BARRACO_LEVEL,
  normalizeBarracoUpgradeState,
} from '../services/barracoProgressionService.js';
import { syncBarracoGangStatBonus } from '../services/gangStatisticsService.js';

function buildPlayerResponse(playerDocument) {
  return mergePlayerState(playerDocument.toObject());
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getAcceleratorSeconds(player = {}) {
  return Math.max(0, Math.floor(safeNumber(player?.barracoAccelerators?.seconds, 0)));
}

function buildBarracoPayload(playerDocument, overrides = {}) {
  const player = playerDocument?.toObject ? playerDocument.toObject() : playerDocument || {};
  const level = Math.max(1, Math.floor(safeNumber(player?.niveis?.barracoLevel, 1)));
  const requirements = getBarracoUpgradeRequirements(player);
  const upgradeStatus = getBarracoUpgradeStatus(player);

  return {
    currentLevel: level,
    nextLevel: Math.min(MAX_BARRACO_LEVEL, level + 1),
    maxLevel: MAX_BARRACO_LEVEL,
    name: getBarracoName(level),
    cost: requirements.cost,
    durationMs: requirements.durationMs,
    durationText: requirements.durationText,
    requirements,
    upgrade: upgradeStatus.operation,
    hasActiveUpgrade: upgradeStatus.hasActiveUpgrade,
    isReady: upgradeStatus.isReady,
    remainingMs: upgradeStatus.remainingMs,
    remainingText: upgradeStatus.remainingText,
    acceleratorSeconds: getAcceleratorSeconds(player),
    ...overrides,
  };
}

function emitPlayerUpdate(playerDocument) {
  const responsePlayer = buildPlayerResponse(playerDocument);
  emitToPlayer(String(playerDocument._id), 'playerUpdate', {
    player: responsePlayer,
  });
  return responsePlayer;
}

export async function getBarracoStatus(req, res) {
  try {
    const player = await Player.findById(req.player._id);
    if (!player) return res.status(404).json({ error: 'Player não encontrado' });

    return res.json({
      ok: true,
      success: true,
      barraco: buildBarracoPayload(player, { action: 'status' }),
      player: buildPlayerResponse(player),
    });
  } catch (error) {
    console.error('Erro em GET /barraco/upgrade/status:', error);
    return res.status(500).json({ error: 'Erro ao consultar evolução do barraco' });
  }
}

export async function startBarracoUpgrade(req, res) {
  try {
    const player = await Player.findById(req.player._id);
    if (!player) return res.status(404).json({ error: 'Player não encontrado' });

    const currentView = buildPlayerResponse(player);
    currentView.power = calculatePlayerPower(currentView);
    const requirements = getBarracoUpgradeRequirements(currentView);

    if (!requirements.allowed) {
      const statusCode = requirements.failedKey === 'upgradeInProgress' ? 409 : 400;
      return res.status(statusCode).json({
        error: requirements.reason || 'Não foi possível iniciar a evolução do barraco.',
        reason: requirements.reason || 'Não foi possível iniciar a evolução do barraco.',
        failedKey: requirements.failedKey,
        requirements,
        barraco: buildBarracoPayload(player),
      });
    }

    const previousLevel = requirements.currentLevel;
    const nextLevel = requirements.nextLevel;
    const cost = requirements.cost;
    const durationMs = getBarracoUpgradeDurationMs(previousLevel);
    const operation = buildBarracoUpgradeOperation({
      fromLevel: previousLevel,
      toLevel: nextLevel,
      cost,
      durationMs,
    });

    // Atualização atômica: impede duplo clique/corrida usando nível, saldo e ausência de obra ativa.
    const updatedPlayer = await Player.findOneAndUpdate(
      {
        _id: player._id,
        'niveis.barracoLevel': previousLevel,
        'balances.cleanMoney': { $gte: cost },
        'punishments.levelProgressionBlocked': { $ne: true },
        'punishments.cleanMoneyBlocked': { $ne: true },
        $or: [
          { 'barracoUpgrade.active': { $ne: true } },
          { barracoUpgrade: { $exists: false } },
        ],
      },
      {
        $inc: {
          'balances.cleanMoney': -cost,
          version: 1,
        },
        $set: {
          barracoUpgrade: operation,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPlayer) {
      const freshPlayer = await Player.findById(player._id);
      if (!freshPlayer) return res.status(404).json({ error: 'Player não encontrado' });

      const freshView = buildPlayerResponse(freshPlayer);
      freshView.power = calculatePlayerPower(freshView);
      const freshRequirements = getBarracoUpgradeRequirements(freshView);
      return res.status(409).json({
        error: freshRequirements.reason || 'Upgrade não confirmado. Atualize a página e tente novamente.',
        reason: freshRequirements.reason || 'Upgrade não confirmado. Atualize a página e tente novamente.',
        failedKey: freshRequirements.failedKey || 'concurrency',
        requirements: freshRequirements,
        barraco: buildBarracoPayload(freshPlayer),
      });
    }

    const responsePlayer = emitPlayerUpdate(updatedPlayer);
    const barraco = buildBarracoPayload(updatedPlayer, {
      action: 'started',
      previousLevel,
      targetLevel: nextLevel,
      cost,
      durationMs,
      durationText: formatDurationMs(durationMs),
      upgrade: normalizeBarracoUpgradeState(updatedPlayer.barracoUpgrade),
    });

    return res.json({
      ok: true,
      success: true,
      message: `Evolução iniciada para o nível ${nextLevel}. Tempo: ${formatDurationMs(durationMs)}.`,
      barraco,
      player: responsePlayer,
    });
  } catch (error) {
    console.error('Erro em /barraco/upgrade:', error);
    return res.status(500).json({ error: 'Erro ao iniciar evolução do barraco' });
  }
}

export async function claimBarracoUpgrade(req, res) {
  try {
    const player = await Player.findById(req.player._id);
    if (!player) return res.status(404).json({ error: 'Player não encontrado' });

    const operation = normalizeBarracoUpgradeState(player.barracoUpgrade || {});

    if (!operation.active) {
      return res.status(400).json({
        error: 'Não existe evolução de barraco em andamento.',
        barraco: buildBarracoPayload(player),
      });
    }

    if (operation.remainingMs > 0) {
      return res.status(400).json({
        error: `A evolução ainda não terminou. Tempo restante: ${formatDurationMs(operation.remainingMs)}.`,
        reason: `A evolução ainda não terminou. Tempo restante: ${formatDurationMs(operation.remainingMs)}.`,
        barraco: buildBarracoPayload(player),
      });
    }

    const nowIso = new Date().toISOString();
    const previousLevel = Math.max(1, Math.floor(safeNumber(operation.fromLevel, player.niveis?.barracoLevel || 1)));
    const nextLevel = Math.min(MAX_BARRACO_LEVEL, Math.max(previousLevel + 1, Math.floor(safeNumber(operation.toLevel, previousLevel + 1))));

    const updatedPlayer = await Player.findOneAndUpdate(
      {
        _id: player._id,
        'niveis.barracoLevel': previousLevel,
        'barracoUpgrade.active': true,
        'barracoUpgrade.fromLevel': previousLevel,
        'barracoUpgrade.toLevel': nextLevel,
        $and: [
          { 'barracoUpgrade.endsAt': operation.endsAt },
          { 'barracoUpgrade.endsAt': { $lte: nowIso } },
        ],
      },
      {
        $set: {
          'niveis.barracoLevel': nextLevel,
          'pageLevels.barraco': nextLevel,
          barracoUpgrade: {
            active: false,
            status: 'completed',
            fromLevel: previousLevel,
            toLevel: nextLevel,
            cost: operation.cost,
            durationMs: operation.durationMs,
            startedAt: operation.startedAt,
            endsAt: operation.endsAt,
            completedAt: nowIso,
            acceleratedMs: operation.acceleratedMs,
          },
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPlayer) {
      const freshPlayer = await Player.findById(player._id);
      return res.status(409).json({
        error: 'Finalização não confirmada. Atualize a página e tente novamente.',
        barraco: freshPlayer ? buildBarracoPayload(freshPlayer) : undefined,
      });
    }

    syncBarracoGangStatBonus(updatedPlayer);

    const recalculatedView = buildPlayerResponse(updatedPlayer);
    updatedPlayer.power = calculatePlayerPower(recalculatedView);
    bumpVersion(updatedPlayer);
    await updatedPlayer.save();

    const responsePlayer = emitPlayerUpdate(updatedPlayer);
    const barraco = buildBarracoPayload(updatedPlayer, {
      action: 'claimed',
      previousLevel,
      currentLevel: nextLevel,
      targetLevel: nextLevel,
      cost: operation.cost,
    });

    return res.json({
      ok: true,
      success: true,
      message: `Barraco evoluído para o nível ${nextLevel}.`,
      barraco,
      player: responsePlayer,
    });
  } catch (error) {
    console.error('Erro em /barraco/upgrade/claim:', error);
    return res.status(500).json({ error: 'Erro ao finalizar evolução do barraco' });
  }
}

export async function accelerateBarracoUpgrade(req, res) {
  try {
    const player = await Player.findById(req.player._id);
    if (!player) return res.status(404).json({ error: 'Player não encontrado' });

    const operation = normalizeBarracoUpgradeState(player.barracoUpgrade || {});
    const availableSeconds = getAcceleratorSeconds(player);
    const requestedSeconds = Math.max(0, Math.floor(safeNumber(req.body?.seconds, 0)));

    if (!operation.active) {
      return res.status(400).json({
        error: 'Não existe evolução de barraco em andamento para acelerar.',
        barraco: buildBarracoPayload(player),
      });
    }

    if (operation.remainingMs <= 0) {
      return res.status(400).json({
        error: 'A evolução já está pronta para finalizar.',
        barraco: buildBarracoPayload(player),
      });
    }

    if (availableSeconds <= 0) {
      return res.status(400).json({
        error: 'Você não possui aceleradores de tempo do barraco.',
        barraco: buildBarracoPayload(player),
      });
    }

    if (requestedSeconds <= 0) {
      return res.status(400).json({
        error: 'Informe a quantidade de segundos de acelerador que deseja usar.',
        barraco: buildBarracoPayload(player),
      });
    }

    const applySeconds = Math.min(
      requestedSeconds,
      availableSeconds,
      Math.ceil(operation.remainingMs / 1000)
    );
    const applyMs = applySeconds * 1000;
    const newEndsAtMs = Math.max(Date.now(), new Date(operation.endsAt).getTime() - applyMs);
    const newEndsAt = new Date(newEndsAtMs).toISOString();
    const isReady = newEndsAtMs <= Date.now();

    const updatedPlayer = await Player.findOneAndUpdate(
      {
        _id: player._id,
        'barracoUpgrade.active': true,
        'barracoUpgrade.status': 'building',
        'barracoUpgrade.endsAt': operation.endsAt,
        'barracoAccelerators.seconds': { $gte: applySeconds },
      },
      {
        $inc: {
          'barracoAccelerators.seconds': -applySeconds,
          'barracoUpgrade.acceleratedMs': applyMs,
          version: 1,
        },
        $set: {
          'barracoUpgrade.endsAt': newEndsAt,
          'barracoUpgrade.status': isReady ? 'ready' : 'building',
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPlayer) {
      const freshPlayer = await Player.findById(player._id);
      return res.status(409).json({
        error: 'Acelerador não confirmado. Atualize a página e tente novamente.',
        barraco: freshPlayer ? buildBarracoPayload(freshPlayer) : undefined,
      });
    }

    const responsePlayer = emitPlayerUpdate(updatedPlayer);
    const barraco = buildBarracoPayload(updatedPlayer, {
      action: 'accelerated',
      appliedSeconds: applySeconds,
      appliedMs: applyMs,
    });

    return res.json({
      ok: true,
      success: true,
      message: `Acelerador aplicado: ${formatDurationMs(applyMs)} removidos da evolução.`,
      barraco,
      player: responsePlayer,
    });
  } catch (error) {
    console.error('Erro em /barraco/upgrade/accelerate:', error);
    return res.status(500).json({ error: 'Erro ao acelerar evolução do barraco' });
  }
}

// Compatibilidade com o nome antigo usado por imports anteriores.
export const upgradeBarraco = startBarracoUpgrade;
