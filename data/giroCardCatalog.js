/**
 * data/giroCardCatalog.js
 * Cartas do metajogo do Giro no Asfalto.
 * Sem pets. As coleções alimentam retenção, facção e eventos.
 */

export const CARD_SETS = Object.freeze({
  arsenal_da_favela: Object.freeze({
    setId: 'arsenal_da_favela',
    name: 'Arsenal da Favela',
    reward: Object.freeze({ corre: 50, dirtyMoney: 20_000, cleanMoney: 0 }),
    cards: Object.freeze([
      { cardId: 'pistola_9mm', name: 'Pistola 9mm', rarity: 'common' },
      { cardId: 'escopeta', name: 'Escopeta', rarity: 'common' },
      { cardId: 'colete_balístico', name: 'Colete Balístico', rarity: 'common' },
      { cardId: 'municao_tracante', name: 'Munição Traçante', rarity: 'rare' },
      { cardId: 'mira_importada', name: 'Mira Importada', rarity: 'rare' },
      { cardId: 'ar15', name: 'AR-15', rarity: 'epic' },
      { cardId: 'granada', name: 'Granada', rarity: 'epic' },
      { cardId: 'fuzil_dourado', name: 'Fuzil Dourado', rarity: 'legendary', isGolden: true },
      { cardId: 'maleta_do_armeiro', name: 'Maleta do Armeiro', rarity: 'legendary', isGolden: true },
    ]),
  }),

  frota_do_corre: Object.freeze({
    setId: 'frota_do_corre',
    name: 'Frota do Corre',
    reward: Object.freeze({ corre: 80, dirtyMoney: 12_000, cleanMoney: 0 }),
    cards: Object.freeze([
      { cardId: 'moto_laranja', name: 'Moto Laranja', rarity: 'common' },
      { cardId: 'gol_rebaixado', name: 'Gol Rebaixado', rarity: 'common' },
      { cardId: 'van_de_carga', name: 'Van de Carga', rarity: 'common' },
      { cardId: 'picape_blindada', name: 'Picape Blindada', rarity: 'rare' },
      { cardId: 'rota_alternativa', name: 'Rota Alternativa', rarity: 'rare' },
      { cardId: 'caminhao_falso', name: 'Caminhão Falso', rarity: 'epic' },
      { cardId: 'comboio_noturno', name: 'Comboio Noturno', rarity: 'epic' },
      { cardId: 'chave_mestra', name: 'Chave Mestra', rarity: 'legendary', isGolden: true },
      { cardId: 'piloto_fantasma', name: 'Piloto Fantasma', rarity: 'legendary', isGolden: true },
    ]),
  }),

  luxo_do_comando: Object.freeze({
    setId: 'luxo_do_comando',
    name: 'Luxo do Comando',
    reward: Object.freeze({ corre: 40, dirtyMoney: 8_000, cleanMoney: 700 }),
    cards: Object.freeze([
      { cardId: 'relogio_importado', name: 'Relógio Importado', rarity: 'common' },
      { cardId: 'corrente_pesada', name: 'Corrente Pesada', rarity: 'common' },
      { cardId: 'tenis_raro', name: 'Tênis Raro', rarity: 'common' },
      { cardId: 'oculos_de_grife', name: 'Óculos de Grife', rarity: 'rare' },
      { cardId: 'garrafa_lacrada', name: 'Garrafa Lacrada', rarity: 'rare' },
      { cardId: 'anel_do_chefe', name: 'Anel do Chefe', rarity: 'epic' },
      { cardId: 'mansao_alugada', name: 'Mansão Alugada', rarity: 'epic' },
      { cardId: 'coroa_do_asfalto', name: 'Coroa do Asfalto', rarity: 'legendary', isGolden: true },
      { cardId: 'cofre_de_ouro', name: 'Cofre de Ouro', rarity: 'legendary', isGolden: true },
    ]),
  }),
});

const RARITY_WEIGHT = Object.freeze({
  common: 76,
  rare: 18,
  epic: 5,
  legendary: 1,
});

function weightedPick(entries) {
  const total = entries.reduce((sum, item) => sum + Math.max(0, Number(item.weight) || 0), 0);
  if (total <= 0) return entries[0]?.value ?? null;
  let roll = Math.random() * total;
  for (const item of entries) {
    roll -= Math.max(0, Number(item.weight) || 0);
    if (roll <= 0) return item.value;
  }
  return entries[entries.length - 1]?.value ?? null;
}

export function getAllCards() {
  return Object.values(CARD_SETS).flatMap((set) =>
    set.cards.map((card) => ({
      ...card,
      setId: set.setId,
      setName: set.name,
    }))
  );
}

export function drawRandomGiroCard(preferredRarity = null) {
  const cards = getAllCards();
  if (preferredRarity) {
    const preferred = cards.filter((card) => card.rarity === preferredRarity);
    if (preferred.length > 0) return preferred[Math.floor(Math.random() * preferred.length)];
  }

  const rarity = weightedPick(
    Object.entries(RARITY_WEIGHT).map(([value, weight]) => ({ value, weight }))
  );
  const pool = cards.filter((card) => card.rarity === rarity);
  const source = pool.length > 0 ? pool : cards;
  return source[Math.floor(Math.random() * source.length)];
}

export function addCardToCollection(player, card) {
  if (!card) return null;
  if (!player.cardCollection) {
    player.cardCollection = { cards: [], completedSets: [], totalCardsCollected: 0, chests: { common: 0, rare: 0, epic: 0 } };
  }
  if (!Array.isArray(player.cardCollection.cards)) player.cardCollection.cards = [];

  const existing = player.cardCollection.cards.find(
    (item) => String(item.cardId) === String(card.cardId)
      && String(item.setId) === String(card.setId)
      && Boolean(item.isGolden) === Boolean(card.isGolden)
  );

  if (existing) {
    existing.quantity = Math.max(0, Number(existing.quantity) || 0) + 1;
  } else {
    player.cardCollection.cards.push({
      cardId: String(card.cardId),
      setId: String(card.setId),
      name: String(card.name),
      rarity: String(card.rarity || 'common'),
      quantity: 1,
      isGolden: Boolean(card.isGolden),
      firstCollectedAt: new Date().toISOString(),
    });
  }

  player.cardCollection.totalCardsCollected = Math.max(0, Number(player.cardCollection.totalCardsCollected) || 0) + 1;

  return {
    cardId: String(card.cardId),
    setId: String(card.setId),
    setName: String(card.setName || ''),
    name: String(card.name),
    rarity: String(card.rarity || 'common'),
    isGolden: Boolean(card.isGolden),
  };
}
