import { ensurePlayerConvoys, normalizePlayerConvoys } from './convoyInventory.js';

export function grantRealMoneyConvoy(player, convoySkinId, options = {}) {
  const convoys = ensurePlayerConvoys(player);
  const id = String(convoySkinId || '').trim();

  if (id && !convoys.ownedSkinIds.includes(id)) {
    convoys.ownedSkinIds.push(id);
  }

  if (options.equip !== false && id) {
    convoys.equippedSkinId = id;
  }

  player.convoys = normalizePlayerConvoys(convoys);
  if (typeof player.markModified === 'function') player.markModified('convoys');
  return player.convoys;
}
