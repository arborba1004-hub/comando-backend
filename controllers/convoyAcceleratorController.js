import Player from '../models/Player.js';
import Attack from '../models/Attack.js';
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

function normalizeAccelerators(raw = {}) {
  return { twoX: Math.max(0, Math.floor(toNumber(raw?.twoX, 0))) };
}

function ensureAccelerators(player) {
  const current = normalizeAccelerators(player?.convoyAccelerators || {});
  if (player) player.convoyAccelerators = current;
  return current;
}

function acceleratorStateChanged(player) {
  const before = JSON.stringify(player?.convoyAccelerators || {});
  const normalized = normalizeAccelerators(player?.convoyAccelerators || {});
  return { normalized, changed: before !== JSON.stringify(normalized) };
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

    const { normalized, changed } = acceleratorStateChanged(player);
    player.convoyAccelerators = normalized;
    if (changed) {
      if (typeof player.markModified === 'function') player.markModified('convoyAccelerators');
      player.version = Math.max(0, Math.floor(toNumber(player.version, 0))) + 1;
      await player.save();
    }

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

    const updatedPlayer = await Player.findOneAndUpdate(
      {
        _id: player._id,
        'balances.dirtyMoney': { $gte: cost },
      },
      {
        $inc: {
          'balances.dirtyMoney': -cost,
          'convoyAccelerators.twoX': quantity,
          version: 1,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedPlayer) {
      const fresh = await Player.findById(player._id).select('balances.dirtyMoney').lean();
      return res.status(400).json({
        error: 'Saldo insuficiente para comprar acelerador de comboio.',
        reason: 'insufficient_dirty_money',
        cost,
        current: toNumber(fresh?.balances?.dirtyMoney, 0),
      });
    }

    emitPlayerUpdate(updatedPlayer);
    return res.json(buildEnvelope(updatedPlayer, { purchased: quantity, cost }));
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

    const attack = await Attack.findOne({
      id: battleId,
      attackerId: String(player._id),
      status: 'travelling',
    });

    if (!attack) {
      return res.status(404).json({ error: 'Ataque ativo não encontrado para este jogador.', reason: 'attack_not_found' });
    }

    const now = Date.now();
    const currentArriveAtIso = String(attack.arriveAtIso || '');
    const currentArriveAtMs = new Date(currentArriveAtIso).getTime();
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

    const updatedPlayer = await Player.findOneAndUpdate(
      {
        _id: player._id,
        'convoyAccelerators.twoX': { $gte: 1 },
      },
      {
        $inc: {
          'convoyAccelerators.twoX': -1,
          version: 1,
        },
        $set: {
          'gang.members.$[member].marchingUntil': arriveAtIso,
        },
      },
      {
        new: true,
        runValidators: true,
        arrayFilters: [
          {
            'member.status': 'marchando',
            'member.activeAttackId': String(battleId),
          },
        ],
      }
    );

    if (!updatedPlayer) {
      return res.status(400).json({
        error: 'Você não tem aceleradores de comboio disponíveis.',
        reason: 'no_accelerators',
      });
    }

    const updatedAttack = await Attack.findOneAndUpdate(
      {
        id: battleId,
        attackerId: String(player._id),
        status: 'travelling',
        arriveAtIso: currentArriveAtIso,
      },
      {
        $set: {
          arriveAtIso,
          totalDurationMs: Math.max(0, newArriveAtMs - launchedAtMs),
          acceleratedAtIso: new Date(now).toISOString(),
        },
        $inc: {
          acceleratorUses: 1,
        },
      },
      { new: true, runValidators: true }
    );

    if (!updatedAttack) {
      // Reembolso defensivo se outra requisição já acelerou a mesma marcha.
      const refundedPlayer = await Player.findOneAndUpdate(
        { _id: player._id },
        { $inc: { 'convoyAccelerators.twoX': 1, version: 1 } },
        { new: true, runValidators: true }
      );
      if (refundedPlayer) emitPlayerUpdate(refundedPlayer);
      return res.status(409).json({
        error: 'Acelerador não confirmado. Atualize a página e tente novamente.',
        reason: 'accelerator_race_conflict',
      });
    }

    emitPlayerUpdate(updatedPlayer);

    const payload = {
      battleId: updatedAttack.id,
      attackerId: String(player._id),
      attackerName: String(player.name || ''),
      attackerConvoySkinId: updatedAttack.attackerConvoySkinId || 'comboio_padrao',
      origin: updatedAttack.origin,
      target: updatedAttack.target,
      route: {
        fromTileX: toNumber(updatedAttack?.origin?.tileX, 0),
        fromTileY: toNumber(updatedAttack?.origin?.tileY, 0),
        toTileX: toNumber(updatedAttack?.target?.tileX, 0),
        toTileY: toNumber(updatedAttack?.target?.tileY, 0),
      },
      routeTiles: Array.isArray(updatedAttack.routeTiles) ? updatedAttack.routeTiles : [],
      routeDistanceTiles: updatedAttack.routeDistanceTiles,
      timePerTileMs: updatedAttack.timePerTileMs,
      totalDurationMs: updatedAttack.totalDurationMs,
      launchedAtIso: updatedAttack.launchedAtIso,
      arriveAtIso: updatedAttack.arriveAtIso,
      remainingBeforeMs,
      remainingAfterMs,
      acceleratorUses: updatedAttack.acceleratorUses,
    };

    try {
      broadcastToAll('attack:squadAccelerated', payload);
    } catch (broadcastError) {
      console.error('[CONVOY_ACCELERATOR_BROADCAST]', broadcastError?.message || broadcastError);
    }

    return res.json(buildEnvelope(updatedPlayer, payload));
  } catch (error) {
    console.error('[CONVOY_ACCELERATOR_USE]', error);
    return res.status(500).json({ error: 'Erro ao usar acelerador de comboio' });
  }
}
