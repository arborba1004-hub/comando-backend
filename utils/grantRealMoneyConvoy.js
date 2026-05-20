import { DEFAULT_CONVOY_SKIN_ID, getConvoySkin } from '../data/convoyCatalog.js';
import { normalizePlayerConvoys } from './convoyInventory.js';

export function grantRealMoneyConvoy(player, skinId, { equip = true } = {}) {
  const skin = getConvoySkin(skinId);
  const convoys = normalizePlayerConvoys(player?.convoys || {});

  if (!convoys.ownedSkinIds.includes(skin.id)) {
    convoys.ownedSkinIds.push(skin.id);
  }

  if (equip) {
    convoys.equippedSkinId = skin.id || DEFAULT_CONVOY_SKIN_ID;
  }

  player.convoys = normalizePlayerConvoys(convoys);
  if (typeof player.markModified === 'function') player.markModified('convoys');

  return player.convoys;
}
