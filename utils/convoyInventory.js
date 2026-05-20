import { DEFAULT_CONVOY_SKIN_ID, getConvoySkin, isValidConvoySkinId } from '../data/convoyCatalog.js';

function uniqueValidSkinIds(ids = []) {
  const set = new Set([DEFAULT_CONVOY_SKIN_ID]);

  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw || '').trim();
    if (isValidConvoySkinId(id)) set.add(id);
  }

  return Array.from(set);
}

export function normalizePlayerConvoys(raw = {}) {
  const ownedSkinIds = uniqueValidSkinIds(raw?.ownedSkinIds);
  const equippedRaw = String(raw?.equippedSkinId || DEFAULT_CONVOY_SKIN_ID).trim();
  const equippedSkinId = ownedSkinIds.includes(equippedRaw) ? equippedRaw : DEFAULT_CONVOY_SKIN_ID;

  return { ownedSkinIds, equippedSkinId };
}

export function ensurePlayerConvoys(player) {
  if (!player) return normalizePlayerConvoys();

  const current = normalizePlayerConvoys(player.convoys || {});
  const beforeOwned = Array.isArray(player.convoys?.ownedSkinIds) ? player.convoys.ownedSkinIds.join('|') : '';
  const beforeEquipped = String(player.convoys?.equippedSkinId || '');

  player.convoys = current;

  const afterOwned = current.ownedSkinIds.join('|');
  if (beforeOwned !== afterOwned || beforeEquipped !== current.equippedSkinId) {
    if (typeof player.markModified === 'function') player.markModified('convoys');
  }

  return current;
}

export function playerOwnsConvoy(player, skinId) {
  const skin = getConvoySkin(skinId);
  const convoys = ensurePlayerConvoys(player);
  return skin.id === DEFAULT_CONVOY_SKIN_ID || convoys.ownedSkinIds.includes(skin.id);
}

export function requireOwnedConvoy(player, skinId) {
  const skin = getConvoySkin(skinId);

  if (!playerOwnsConvoy(player, skin.id)) {
    const error = new Error('Você precisa comprar esse comboio antes de usar no ataque.');
    error.status = 403;
    error.reason = 'convoy_not_owned';
    error.skinId = skin.id;
    throw error;
  }

  return skin;
}
