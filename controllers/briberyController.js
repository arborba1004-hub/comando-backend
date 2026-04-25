import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';

function addHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

export async function bribe(req, res) {
  try {
    const player = req.player;
    const { value } = req.body || {};

    const amount = Number(value || 0);

    if (amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido para suborno' });
    }

    if ((player.balances?.dirtyMoney || 0) < amount) {
      return res.status(400).json({ error: 'Dinheiro sujo insuficiente' });
    }

    player.balances.dirtyMoney -= amount;
    player.niveis.barracoLevel += 1;

    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro em bribe:', error);
    return res.status(500).json({ error: 'Erro no suborno' });
  }
}

export async function delacao(req, res) {
  try {
    const player = req.player;

    const expiresAt = addHours(72);

    player.punishments.delacao = {
      active: true,
      expiresAt,
    };

    player.punishments.inventoryBlocked = true;
    player.punishments.dirtyMoneyBlocked = true;
    player.punishments.cleanMoneyBlocked = true;
    player.punishments.levelProgressionBlocked = true;
    player.punishments.inventoryBonusReductionPercent = 100;
    player.punishments.pvpProtectionUntil = expiresAt;
    player.punishments.delacaoRewardPending = true;
    player.punishments.delacaoRewardUnlockAt = expiresAt;
    player.punishments.pendingSkillBoost = 100;

    player.skillBoostMultiplier = 2.0;

    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro em delacao:', error);
    return res.status(500).json({ error: 'Erro na delação' });
  }
}