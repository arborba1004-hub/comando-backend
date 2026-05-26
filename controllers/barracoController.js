import Player from '../models/Player.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion, calculatePlayerPower } from '../utils/gameHelpers.js';
import {
  getBarracoName,
  getBarracoUpgradeRequirements,
  MAX_BARRACO_LEVEL,
} from '../services/barracoProgressionService.js';

function buildPlayerResponse(playerDocument) {
  return mergePlayerState(playerDocument.toObject());
}

function buildBarracoPayload(previousLevel, currentLevel, cost) {
  return {
    previousLevel,
    currentLevel,
    nextLevel: Math.min(MAX_BARRACO_LEVEL, currentLevel + 1),
    maxLevel: MAX_BARRACO_LEVEL,
    cost,
    name: getBarracoName(currentLevel),
  };
}

export async function upgradeBarraco(req, res) {
  try {
    const player = req.player;
    const currentView = buildPlayerResponse(player);
    currentView.power = calculatePlayerPower(currentView);
    const requirements = getBarracoUpgradeRequirements(currentView);

    if (!requirements.allowed) {
      return res.status(400).json({
        error: requirements.reason || 'Não foi possível evoluir o barraco.',
        reason: requirements.reason || 'Não foi possível evoluir o barraco.',
        failedKey: requirements.failedKey,
        requirements,
      });
    }

    const previousLevel = requirements.currentLevel;
    const nextLevel = requirements.nextLevel;
    const cost = requirements.cost;

    // Atualização atômica: impede duplo clique/corrida usando o nível atual como trava.
    const updatedPlayer = await Player.findOneAndUpdate(
      {
        _id: player._id,
        'niveis.barracoLevel': previousLevel,
        'balances.cleanMoney': { $gte: cost },
        'punishments.levelProgressionBlocked': { $ne: true },
      },
      {
        $inc: {
          'balances.cleanMoney': -cost,
        },
        $set: {
          'niveis.barracoLevel': nextLevel,
          'pageLevels.barraco': nextLevel,
        },
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedPlayer) {
      const freshPlayer = await Player.findById(player._id);
      if (!freshPlayer) {
        return res.status(404).json({ error: 'Player não encontrado' });
      }

      const freshView = buildPlayerResponse(freshPlayer);
      freshView.power = calculatePlayerPower(freshView);
      const freshRequirements = getBarracoUpgradeRequirements(freshView);
      return res.status(409).json({
        error: freshRequirements.reason || 'Upgrade não confirmado. Atualize a página e tente novamente.',
        reason: freshRequirements.reason || 'Upgrade não confirmado. Atualize a página e tente novamente.',
        failedKey: freshRequirements.failedKey || 'concurrency',
        requirements: freshRequirements,
      });
    }

    const recalculatedView = buildPlayerResponse(updatedPlayer);
    updatedPlayer.power = calculatePlayerPower(recalculatedView);
    bumpVersion(updatedPlayer);
    await updatedPlayer.save();

    const responsePlayer = buildPlayerResponse(updatedPlayer);
    const barraco = buildBarracoPayload(previousLevel, nextLevel, cost);

    emitToPlayer(String(updatedPlayer._id), 'playerUpdate', {
      player: responsePlayer,
    });

    return res.json({
      ok: true,
      success: true,
      message: `Barraco evoluído para o nível ${nextLevel}.`,
      barraco,
      player: responsePlayer,
    });
  } catch (error) {
    console.error('Erro em /barraco/upgrade:', error);
    return res.status(500).json({ error: 'Erro ao evoluir barraco' });
  }
}
