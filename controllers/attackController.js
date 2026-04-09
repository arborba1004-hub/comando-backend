import Attack from '../models/Attack.js';
import Player from '../models/Player.js';
import {
  bumpVersion,
  calculateLoot,
  calculatePlayerPower,
  calculateWinChance,
  generateId,
} from '../utils/gameHelpers.js';
import { mergePlayerState } from '../utils/playerMapper.js';

export async function initiateAttack(req, res) {
  try {
    const attacker = req.player;
    const { targetId } = req.body || {};

    if (!targetId) {
      return res.status(400).json({ error: 'targetId é obrigatório' });
    }

    if (String(attacker._id) === String(targetId)) {
      return res.status(400).json({ error: 'Não pode atacar a si mesmo' });
    }

    const defender = await Player.findById(targetId);

    if (!defender) {
      return res.status(404).json({ error: 'Jogador alvo não encontrado' });
    }

    if (attacker.factionId && defender.factionId && attacker.factionId === defender.factionId) {
      return res.status(403).json({ error: 'Não pode atacar membro da mesma facção' });
    }

    const pvpUntil = defender.punishments?.pvpProtectionUntil;
    if (pvpUntil && new Date(pvpUntil) > new Date()) {
      return res.status(403).json({ error: 'Este jogador está sob proteção' });
    }

    if (defender.punishments?.dirtyMoneyBlocked) {
      return res.status(403).json({ error: 'Alvo está com dinheiro sujo bloqueado' });
    }

    const now = Date.now();
    if (attacker.lastAttackAt && now - attacker.lastAttackAt < 30000) {
      return res.status(429).json({ error: 'Aguarde 30 segundos para atacar novamente' });
    }

    const attackerPower = calculatePlayerPower(attacker);
    const defenderPower = calculatePlayerPower(defender);
    const chance = calculateWinChance(attackerPower, defenderPower);
    const critical = Math.random() < 0.15;
    const success = Math.random() < chance;

    let loot = 0;
    let attackerDirtyDelta = 0;

    if (success) {
      loot = calculateLoot(
        defender.balances?.dirtyMoney || 0,
        defender.niveis?.playerLevel || 1,
        critical
      );
      attackerDirtyDelta = loot;
      defender.balances.dirtyMoney = Math.max(0, (defender.balances.dirtyMoney || 0) - loot);
    } else {
      const penalty = Math.floor((attacker.balances?.dirtyMoney || 0) * 0.05);
      attackerDirtyDelta = -penalty;
    }

    attacker.balances.dirtyMoney = Math.max(
      0,
      (attacker.balances?.dirtyMoney || 0) + attackerDirtyDelta
    );
    attacker.lastAttackAt = now;

    const attackRecord = await Attack.create({
      id: generateId(),
      attackerId: String(attacker._id),
      attackerName: attacker.name,
      targetId: String(defender._id),
      targetName: defender.name,
      success,
      critical,
      loot: success ? loot : 0,
      chance,
      attackerPower,
      defenderPower,
      message: success
        ? critical
          ? 'Ataque crítico! Você dominou o território.'
          : 'Ataque bem-sucedido!'
        : 'Seu ataque falhou. Você perdeu 5% do dinheiro sujo.',
    });

    const attackerNotification = {
      id: generateId(),
      type: success ? 'attack_success' : 'attack_failed',
      targetId: String(defender._id),
      targetName: defender.name,
      success,
      loot: success ? loot : 0,
      createdAt: new Date().toISOString(),
      read: false,
    };

    const defenderNotification = {
      id: generateId(),
      type: 'attack_received',
      attackerId: String(attacker._id),
      attackerName: attacker.name,
      success,
      loot: success ? loot : 0,
      createdAt: new Date().toISOString(),
      read: false,
    };

    attacker.attackHistory = attacker.attackHistory || [];
    defender.attackHistory = defender.attackHistory || [];
    attacker.notifications = attacker.notifications || [];
    defender.notifications = defender.notifications || [];

    const historyItem = {
      id: attackRecord.id,
      attackerId: attackRecord.attackerId,
      attackerName: attackRecord.attackerName,
      targetId: attackRecord.targetId,
      targetName: attackRecord.targetName,
      success: attackRecord.success,
      loot: attackRecord.loot,
      createdAt: attackRecord.createdAtIso,
    };

    attacker.attackHistory.unshift(historyItem);
    defender.attackHistory.unshift(historyItem);

    attacker.notifications.unshift(attackerNotification);
    defender.notifications.unshift(defenderNotification);

    if (attacker.attackHistory.length > 50) attacker.attackHistory.pop();
    if (defender.attackHistory.length > 50) defender.attackHistory.pop();
    if (attacker.notifications.length > 20) attacker.notifications.pop();
    if (defender.notifications.length > 20) defender.notifications.pop();

    bumpVersion(attacker);
    bumpVersion(defender);
    await attacker.save();
    await defender.save();

    return res.json({
      success,
      critical,
      loot: success ? loot : 0,
      chance,
      attackerPower,
      defenderPower,
      message: attackRecord.message,
      attacker: mergePlayerState(attacker.toObject()),
      defender: mergePlayerState(defender.toObject()),
    });
  } catch (error) {
    console.error('Erro ao atacar:', error);
    return res.status(500).json({ error: 'Erro ao processar ataque' });
  }
}