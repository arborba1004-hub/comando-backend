import Attack from '../models/Attack.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer, broadcastToAll } from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';

const ACCELERATOR_PRICE_DIRTY = 1000;
const MIN_REMAINING_TO_ACCELERATE_MS = 1200;
const MIN_AFTER_ACCELERATION_MS = 500;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, min, max) {
  const n = Math.floor(toNumber(value, min));
  return Math.max(min, Math.min(max, n));
}

function ensureAccelerators(player) {
  const current = player.convoyAccelerators || {};
  player.convoyAccelerators = {
    twoX: Math.max(0, Math.floor(toNumber(current.twoX, 0))),
  };
  return player.convoyAccelerators;
}

function emitPlayerUpdate(player) {
  const playerId = String(player?._id || '');
  if (!playerId) return;
  const plain = typeof player.toObject === 'function' ? player.toObject() : player;
  emitToPlayer(playerId, 'playerUpdate', { player: mergePlayerState(plain) });
}

function buildEnvelope(player, extra = {}) {
  const accelerators = ensureAccelerators(player);
  const plain = typeof player?.toObject === 'function' ? player.toObject() : player;

  return {
    accelerators: {
      twoX: accelerators.twoX,
    },
    priceDirtyMoney: ACCELERATOR_PRICE_DIRTY,
    player: plain ? mergePlayerState(plain) : undefined,
    ...extra,
  };
}

export async function getConvoyAccelerators(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    ensureAccelerators(player);
    await player.save();

    return res.json(buildEnvelope(player));
  } catch (error) {
    console.error('[CONVOY_ACCELERATORS_ME]', error);
    return res.status(500).json({ error: 'Erro ao buscar aceleradores de comboio' });
  }
}

export async function purchaseConvoyAccelerator(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const quantity = clampInt(req.body?.quantity ?? 1, 1, 99);
    const cost = ACCELERATOR_PRICE_DIRTY * quantity;

    player.balances = player.balances || {};
    const dirtyMoney = toNumber(player.balances.dirtyMoney, 0);

    if (dirtyMoney < cost) {
      return res.status(400).json({
        error: 'Saldo insuficiente para comprar acelerador de comboio.',
        reason: 'insufficient_dirty_money',
        cost,
        current: dirtyMoney,
      });
    }

    const accelerators = ensureAccelerators(player);
    player.balances.dirtyMoney = Math.max(0, dirtyMoney - cost);
    accelerators.twoX += quantity;

    if (typeof player.markModified === 'function') {
      player.markModified('balances');
      player.markModified('convoyAccelerators');
    }

    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);

    return res.json(buildEnvelope(player, { purchased: quantity, cost }));
  } catch (error) {
    console.error('[CONVOY_ACCELERATOR_PURCHASE]', error);
    return res.status(500).json({ error: 'Erro ao comprar acelerador de comboio' });
  }
}

export async function useConvoyAccelerator(req, res) {
  try {
    const player = req.player;
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const battleId = String(req.body?.battleId || req.params?.battleId || '').trim();
    if (!battleId) return res.status(400).json({ error: 'battleId é obrigatório', reason: 'missing_battle_id' });

    const accelerators = ensureAccelerators(player);
    if (accelerators.twoX <= 0) {
      return res.status(400).json({ error: 'Você não tem aceleradores de comboio disponíveis.', reason: 'no_accelerators' });
    }

    const attack = await Attack.findOne({
      id: battleId,
      attackerId: String(player._id),
      status: 'travelling',
    });

    if (!attack) {
      return res.status(404).json({ error: 'Ataque ativo não encontrado para este jogador.', reason: 'attack_not_found' });
    }

    const now = Date.now();
    const currentArriveAtMs = new Date(attack.arriveAtIso).getTime();
    const launchedAtMs = new Date(attack.launchedAtIso).getTime();

    if (!Number.isFinite(currentArriveAtMs) || currentArriveAtMs <= now) {
      return res.status(409).json({ error: 'O comboio já chegou ou está resolvendo.', reason: 'already_arrived' });
    }

    const remainingBeforeMs = Math.max(0, currentArriveAtMs - now);
    if (remainingBeforeMs < MIN_REMAINING_TO_ACCELERATE_MS) {
      return res.status(409).json({ error: 'Muito perto da chegada para usar acelerador.', reason: 'too_close_to_arrival' });
    }

    const remainingAfterMs = Math.max(MIN_AFTER_ACCELERATION_MS, Math.floor(remainingBeforeMs / 2));
    const newArriveAtMs = now + remainingAfterMs;
    const arriveAtIso = new Date(newArriveAtMs).toISOString();

    accelerators.twoX -= 1;

    attack.arriveAtIso = arriveAtIso;
    attack.totalDurationMs = Math.max(0, newArriveAtMs - launchedAtMs);
    attack.acceleratorUses = Math.max(0, Math.floor(toNumber(attack.acceleratorUses, 0))) + 1;
    attack.acceleratedAtIso = new Date(now).toISOString();

    if (Array.isArray(player.gang?.members)) {
      for (const member of player.gang.members) {
        if (member?.status === 'marchando' && String(member.activeAttackId || '') === String(battleId)) {
          member.marchingUntil = arriveAtIso;
        }
      }
    }

    if (typeof player.markModified === 'function') {
      player.markModified('convoyAccelerators');
      player.markModified('gang');
    }

    bumpVersion(player);

    await attack.save();
    await player.save();
    emitPlayerUpdate(player);

    const payload = {
      battleId: attack.id,
      attackerId: String(player._id),
      attackerName: String(player.name || ''),
      attackerConvoySkinId: attack.attackerConvoySkinId || 'comboio_padrao',
      origin: attack.origin,
      target: attack.target,
      route: {
        fromTileX: toNumber(attack?.origin?.tileX, 0),
        fromTileY: toNumber(attack?.origin?.tileY, 0),
        toTileX: toNumber(attack?.target?.tileX, 0),
        toTileY: toNumber(attack?.target?.tileY, 0),
      },
      routeTiles: Array.isArray(attack.routeTiles) ? attack.routeTiles : [],
      routeDistanceTiles: attack.routeDistanceTiles,
      timePerTileMs: attack.timePerTileMs,
      totalDurationMs: attack.totalDurationMs,
      launchedAtIso: attack.launchedAtIso,
      arriveAtIso: attack.arriveAtIso,
      remainingBeforeMs,
      remainingAfterMs,
      acceleratorUses: attack.acceleratorUses,
    };

    try {
      broadcastToAll('attack:squadAccelerated', payload);
    } catch (broadcastError) {
      console.error('[CONVOY_ACCELERATOR_BROADCAST]', broadcastError?.message || broadcastError);
    }

    return res.json(buildEnvelope(player, payload));
  } catch (error) {
    console.error('[CONVOY_ACCELERATOR_USE]', error);
    return res.status(500).json({ error: 'Erro ao usar acelerador de comboio' });
  }
}
