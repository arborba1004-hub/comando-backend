import { CONVOY_CATALOG, DEFAULT_CONVOY_SKIN_ID, getConvoySkin } from '../data/convoyCatalog.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { mergePlayerState } from '../utils/playerMapper.js';
import { ensurePlayerConvoys, normalizePlayerConvoys, playerOwnsConvoy } from '../utils/convoyInventory.js';

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

function buildEnvelope(player) {
  const convoys = normalizePlayerConvoys(player?.convoys || {});
  const plain = typeof player?.toObject === 'function' ? player.toObject() : player;

  return {
    ...convoys,
    player: plain ? mergePlayerState(plain) : undefined,
  };
}

function deductBalance(player, currency, price) {
  if (price <= 0) return;

  if (currency === 'realMoney') {
    const error = new Error('Este comboio exige pagamento real e não pode ser comprado por esta rota de teste.');
    error.status = 400;
    error.reason = 'real_money_not_supported_here';
    throw error;
  }

  player.balances = player.balances || {};

  if (!Object.prototype.hasOwnProperty.call(player.balances, currency)) {
    const error = new Error(`Moeda inválida para comboio: ${currency}`);
    error.status = 400;
    error.reason = 'invalid_currency';
    throw error;
  }

  const current = toNumber(player.balances[currency], 0);
  if (current < price) {
    const error = new Error('Saldo insuficiente para comprar este comboio.');
    error.status = 400;
    error.reason = 'insufficient_balance';
    error.currency = currency;
    error.price = price;
    error.current = current;
    throw error;
  }

  player.balances[currency] = Math.max(0, current - price);
  if (typeof player.markModified === 'function') player.markModified('balances');
}

export async function getConvoyCatalog(req, res) {
  return res.json({ catalog: CONVOY_CATALOG });
}

export async function getMyConvoys(req, res) {
  try {
    const player = getRequesterPlayer(req);
    if (!player) return res.status(401).json({ error: 'Usuário não autenticado' });

    ensurePlayerConvoys(player);
    await player.save();

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

    const convoys = ensurePlayerConvoys(player);

    if (!convoys.ownedSkinIds.includes(skin.id)) {
      deductBalance(player, skin.currency, Math.max(0, toNumber(skin.price, 0)));
      convoys.ownedSkinIds.push(skin.id);
    }

    convoys.equippedSkinId = skin.id || DEFAULT_CONVOY_SKIN_ID;
    player.convoys = normalizePlayerConvoys(convoys);

    if (typeof player.markModified === 'function') player.markModified('convoys');
    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);

    return res.json(buildEnvelope(player));
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

    const convoys = ensurePlayerConvoys(player);
    convoys.equippedSkinId = skin.id;
    player.convoys = normalizePlayerConvoys(convoys);

    if (typeof player.markModified === 'function') player.markModified('convoys');
    bumpVersion(player);
    await player.save();
    emitPlayerUpdate(player);

    return res.json(buildEnvelope(player));
  } catch (error) {
    console.error('[CONVOYS_EQUIP]', error);
    return res.status(error.status || 500).json({ error: error.message || 'Erro ao equipar comboio' });
  }
}
