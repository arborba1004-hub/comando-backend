import Player from '../models/Player.js';
import { CONVOY_CATALOG, DEFAULT_CONVOY_SKIN_ID, getConvoySkin } from '../data/convoyCatalog.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { normalizePlayerConvoys, playerOwnsConvoy } from '../utils/convoyInventory.js';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getRequesterPlayer(req) {
  return req.player || null;
}

function emitPlayerUpdate(player) {
  const playerId = String(player?._id || '');
  if (!playerId) return;
  const plain = typeof player.toObject === 'function' ? player.toObject() : player;
  emitToPlayer(playerId, 'playerUpdate', { player: mergePlayerState(plain) });
}

function needsConvoyNormalization(player) {
  const before = JSON.stringify(player?.convoys || {});
  const normalized = normalizePlayerConvoys(player?.convoys || {});
  const after = JSON.stringify(normalized);
  return { normalized, changed: before !== after };
}

function buildEnvelope(player) {
  const convoys = normalizePlayerConvoys(player?.convoys || {});
  const plain = typeof player?.toObject === 'function' ? player.toObject() : player;

  return {
    ...convoys,
    player: plain ? mergePlayerState(plain) : undefined,
  };
}

function getBalanceField(currency) {
  if (!['dirtyMoney', 'cleanMoney', 'corre'].includes(String(currency))) {
    const error = new Error(`Moeda inválida para comboio: ${currency}`);
    error.status = 400;
    error.reason = 'invalid_currency';
    throw error;
  }
  return `balances.${currency}`;
}

export async function getConvoyCatalog(_req, res) {
  return res.json({ catalog: CONVOY_CATALOG });
}

export async function getMyConvoys(req, res) {
  try {
    const player = getRequesterPlayer(req);
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const { normalized, changed } = needsConvoyNormalization(player);
    player.convoys = normalized;
    if (changed) {
      if (typeof player.markModified === 'function') player.markModified('convoys');
      player.version = Math.max(0, Math.floor(toNumber(player.version, 0))) + 1;
      await player.save();
    }

    return res.json(buildEnvelope(player));
  } catch (error) {
    console.error('[CONVOYS_ME]', error);
    return res.status(500).json({ error: 'Erro ao buscar comboios do jogador' });
  }
}

export async function purchaseConvoy(req, res) {
  try {
    const player = getRequesterPlayer(req);
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const skinId = String(req.body?.skinId || '').trim();
    const skin = getConvoySkin(skinId);

    if (!skinId || skin.id !== skinId) {
      return res.status(404).json({ error: 'Comboio não encontrado', reason: 'convoy_not_found' });
    }

    if (skin.currency === 'realMoney') {
      return res.status(400).json({
        error: 'Este comboio exige pagamento real e não pode ser comprado por esta rota de teste.',
        reason: 'real_money_not_supported_here',
      });
    }

    const price = Math.max(0, toNumber(skin.price, 0));
    const balanceField = getBalanceField(skin.currency);
    const requesterId = String(player._id);

    if (playerOwnsConvoy(player, skin.id)) {
      const updated = await Player.findOneAndUpdate(
        { _id: requesterId },
        {
          $set: { 'convoys.equippedSkinId': skin.id },
          $addToSet: { 'convoys.ownedSkinIds': DEFAULT_CONVOY_SKIN_ID },
          $inc: { version: 1 },
        },
        { new: true, runValidators: true }
      );
      if (!updated) return res.status(404).json({ error: 'Player não encontrado' });
      emitPlayerUpdate(updated);
      return res.json(buildEnvelope(updated));
    }

    const updatedPlayer = await Player.findOneAndUpdate(
      {
        _id: requesterId,
        [balanceField]: { $gte: price },
        'convoys.ownedSkinIds': { $ne: skin.id },
      },
      {
        $inc: { [balanceField]: -price, version: 1 },
        $addToSet: { 'convoys.ownedSkinIds': { $each: [DEFAULT_CONVOY_SKIN_ID, skin.id] } },
        $set: { 'convoys.equippedSkinId': skin.id },
      },
      { new: true, runValidators: true }
    );

    if (!updatedPlayer) {
      const fresh = await Player.findById(requesterId).lean();
      const freshConvoys = normalizePlayerConvoys(fresh?.convoys || {});
      if (freshConvoys.ownedSkinIds.includes(skin.id)) {
        const equipped = await Player.findOneAndUpdate(
          { _id: requesterId },
          { $set: { 'convoys.equippedSkinId': skin.id }, $inc: { version: 1 } },
          { new: true, runValidators: true }
        );
        if (equipped) {
          emitPlayerUpdate(equipped);
          return res.json(buildEnvelope(equipped));
        }
      }

      const current = toNumber(fresh?.balances?.[skin.currency], 0);
      return res.status(400).json({
        error: 'Saldo insuficiente para comprar este comboio.',
        reason: 'insufficient_balance',
        currency: skin.currency,
        price,
        current,
      });
    }

    emitPlayerUpdate(updatedPlayer);
    return res.json(buildEnvelope(updatedPlayer));
  } catch (error) {
    console.error('[CONVOYS_PURCHASE]', error);
    return res.status(error.status || 500).json({
      error: error.message || 'Erro ao comprar comboio',
      reason: error.reason || 'purchase_error',
      currency: error.currency,
      price: error.price,
      current: error.current,
    });
  }
}

export async function equipConvoy(req, res) {
  try {
    const player = getRequesterPlayer(req);
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    const skinId = String(req.body?.skinId || '').trim();
    const skin = getConvoySkin(skinId);

    if (!skinId || skin.id !== skinId) {
      return res.status(404).json({ error: 'Comboio não encontrado', reason: 'convoy_not_found' });
    }

    if (!playerOwnsConvoy(player, skin.id)) {
      return res.status(403).json({
        error: 'Você precisa comprar esse comboio antes de equipar.',
        reason: 'convoy_not_owned',
        skinId: skin.id,
      });
    }

    const equipFilter = skin.id === DEFAULT_CONVOY_SKIN_ID
      ? { _id: player._id }
      : { _id: player._id, 'convoys.ownedSkinIds': skin.id };

    const updatedPlayer = await Player.findOneAndUpdate(
      equipFilter,
      {
        $set: { 'convoys.equippedSkinId': skin.id },
        $addToSet: { 'convoys.ownedSkinIds': DEFAULT_CONVOY_SKIN_ID },
        $inc: { version: 1 },
      },
      { new: true, runValidators: true }
    );

    if (!updatedPlayer) {
      return res.status(409).json({
        error: 'Não foi possível equipar esse comboio. Atualize e tente novamente.',
        reason: 'convoy_equip_conflict',
      });
    }

    emitPlayerUpdate(updatedPlayer);
    return res.json(buildEnvelope(updatedPlayer));
  } catch (error) {
    console.error('[CONVOYS_EQUIP]', error);
    return res.status(error.status || 500).json({ error: error.message || 'Erro ao equipar comboio' });
  }
}
