/**
 * powerSystem.js — FONTE DE VERDADE para cálculo de poder no Commandia
 *
 * Todas as fórmulas aqui devem ser espelhadas em:
 * frontend/src/services/powerSystem.ts
 *
 * FONTES QUE ALIMENTAM O PODER EFETIVO:
 *  1. Skills do jogador       (attack, defense, agility, intelligence, respect, vigor)
 *  2. Bônus de armas          (attackBonus% de cada arma equipada no inventário)
 *  3. Bônus de acessórios     (% por skillType × quantidade comprada)
 *  4. Buffs de facção         (investmentBuffs da facção do jogador)
 *  5. Gangue                  (totalPower × 0.45 de contribuição ao poder)
 *  6. Formação da gangue      (modificadores % sobre os stats da gangue)
 *  7. CT (nível)              (afeta treino e recuperação — indireto no combate)
 */

// ─────────────────────────────────────────────
// PESOS DAS SKILLS NO CÁLCULO DE PODER BASE
// ─────────────────────────────────────────────
export const SKILL_WEIGHTS = {
  attack:       1.40,
  defense:      1.20,
  vigor:        1.25,
  agility:      1.15,
  intelligence: 1.10,
  respect:      0.90,
};

// ─────────────────────────────────────────────
// PESOS DOS STATS DA GANGUE NO TOTAL POWER
// ─────────────────────────────────────────────
export const GANG_STAT_WEIGHTS = {
  rajada:             1.15,
  blindagem:          1.05,
  folego:             0.95,
  quebra:             1.20,
  intelPower:         0.35,
  mobilityPower:      0.30,
  weaponPower:        0.40,
  coordinationPower:  0.25,
};

// Contribuição da gangue ao poder efetivo do jogador
export const GANG_CONTRIBUTION_FACTOR = 0.45;

// ─────────────────────────────────────────────
// BÔNUS DE ACESSÓRIOS
// ─────────────────────────────────────────────
export const ACCESSORY_BONUS_BY_LEVEL = {
  low:  1,  // playerLevel ≤ 50 → +1% por acessório do tipo
  high: 2,  // playerLevel > 50 → +2% por acessório do tipo
};

// ─────────────────────────────────────────────
// PESOS DOS BUFFS DE FACÇÃO NO PODER DO ATACANTE
// ─────────────────────────────────────────────
export const FACTION_ATTACK_WEIGHTS = {
  attackPercent:       1.00,
  agilityPercent:      0.35,
  intelligencePercent: 0.25,
  respectPercent:      0.15,
};

// ─────────────────────────────────────────────
// PESOS DOS BUFFS DE FACÇÃO NO PODER DO DEFENSOR
// ─────────────────────────────────────────────
export const FACTION_DEFENSE_WEIGHTS = {
  defensePercent:      1.00,
  baseDefensePercent:  0.80,
  hpPercent:           0.40,
  agilityPercent:      0.20,
  intelligencePercent: 0.20,
};

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ─────────────────────────────────────────────
// 1. PODER BASE DO JOGADOR (só skills)
// Esta é a fórmula autoritativa — nunca aceitar
// o campo power vindo do cliente sem recalcular.
// ─────────────────────────────────────────────
export function calculateBasePower(player) {
  const s = player?.skills || {};
  return Math.floor(
    safeNum(s.attack)       * SKILL_WEIGHTS.attack +
    safeNum(s.defense)      * SKILL_WEIGHTS.defense +
    safeNum(s.vigor)        * SKILL_WEIGHTS.vigor +
    safeNum(s.agility)      * SKILL_WEIGHTS.agility +
    safeNum(s.intelligence) * SKILL_WEIGHTS.intelligence +
    safeNum(s.respect)      * SKILL_WEIGHTS.respect
  );
}

// ─────────────────────────────────────────────
// 2. BÔNUS DE ARMAS
// Soma attackBonus% de todas as armas no inventário
// ─────────────────────────────────────────────
export function calculateWeaponBonus(player) {
  const items = player?.inventory?.items || [];
  let totalAttackBonus = 0;
  let totalDefenseBonus = 0;

  for (const item of items) {
    if (item?.category === 'weapon') {
      totalAttackBonus  += safeNum(item.attackBonus, 0);
      totalDefenseBonus += safeNum(item.defenseBonus, 0);
    }
  }

  return { attackBonus: totalAttackBonus, defenseBonus: totalDefenseBonus };
}

// ─────────────────────────────────────────────
// 3. BÔNUS DE ACESSÓRIOS
// Cada acessório comprado dá +1% (ou +2% acima do nível 50)
// sobre a skill associada (skillType)
// ─────────────────────────────────────────────
export function calculateAccessoryBonus(player) {
  const accessories = player?.purchasedAccessories || [];
  const playerLevel  = safeNum(player?.niveis?.playerLevel, 1);
  const bonusPerItem = playerLevel > 50
    ? ACCESSORY_BONUS_BY_LEVEL.high
    : ACCESSORY_BONUS_BY_LEVEL.low;

  // Agrupa por skillType
  const byType = {};
  for (const acc of accessories) {
    const t = acc?.skillType;
    if (t) byType[t] = (byType[t] || 0) + bonusPerItem;
  }

  return byType; // ex: { attack: 3, defense: 2, ... }
}

// ─────────────────────────────────────────────
// 4. PODER COM ARMAS + ACESSÓRIOS
// Aplica os bônus percentuais sobre o poder base
// ─────────────────────────────────────────────
export function calculateEnhancedPower(player) {
  const base         = calculateBasePower(player);
  const weaponBonus  = calculateWeaponBonus(player);
  const accBonus     = calculateAccessoryBonus(player);
  const s            = player?.skills || {};

  // Recalcula com skills modificadas por acessórios
  const enhanced = Math.floor(
    safeNum(s.attack)       * (1 + safeNum(accBonus.attack, 0) / 100)        * SKILL_WEIGHTS.attack +
    safeNum(s.defense)      * (1 + safeNum(accBonus.defense, 0) / 100)       * SKILL_WEIGHTS.defense +
    safeNum(s.vigor)        * (1 + safeNum(accBonus.vigor, 0) / 100)         * SKILL_WEIGHTS.vigor +
    safeNum(s.agility)      * (1 + safeNum(accBonus.agility, 0) / 100)       * SKILL_WEIGHTS.agility +
    safeNum(s.intelligence) * (1 + safeNum(accBonus.intelligence, 0) / 100)  * SKILL_WEIGHTS.intelligence +
    safeNum(s.respect)      * (1 + safeNum(accBonus.respect, 0) / 100)       * SKILL_WEIGHTS.respect
  );

  // Bônus de ataque das armas contribui diretamente
  const weaponContrib = Math.floor(enhanced * (weaponBonus.attackBonus / 100));

  return enhanced + weaponContrib;
}

// Alias para compatibilidade — esta é a função chamada em todos os controllers
export function calculatePlayerPower(player) {
  return calculateEnhancedPower(player);
}

// ─────────────────────────────────────────────
// 5. PODER EFETIVO (combate real)
// Aplica buffs de facção + contribuição da gangue
// ─────────────────────────────────────────────
export function calculateEffectiveAttackerPower(playerPower, factionBuffs, gangTotalPower) {
  const buffs = factionBuffs || {};

  const factionMultiplier = 1 + (
    safeNum(buffs.attackPercent)       * FACTION_ATTACK_WEIGHTS.attackPercent +
    safeNum(buffs.agilityPercent)      * FACTION_ATTACK_WEIGHTS.agilityPercent +
    safeNum(buffs.intelligencePercent) * FACTION_ATTACK_WEIGHTS.intelligencePercent +
    safeNum(buffs.respectPercent)      * FACTION_ATTACK_WEIGHTS.respectPercent
  ) / 100;

  return Math.floor(
    safeNum(playerPower) * factionMultiplier +
    safeNum(gangTotalPower) * GANG_CONTRIBUTION_FACTOR
  );
}

export function calculateEffectiveDefenderPower(playerPower, factionBuffs, gangTotalPower) {
  const buffs = factionBuffs || {};

  const factionMultiplier = 1 + (
    safeNum(buffs.defensePercent)      * FACTION_DEFENSE_WEIGHTS.defensePercent +
    safeNum(buffs.baseDefensePercent)  * FACTION_DEFENSE_WEIGHTS.baseDefensePercent +
    safeNum(buffs.hpPercent)           * FACTION_DEFENSE_WEIGHTS.hpPercent +
    safeNum(buffs.agilityPercent)      * FACTION_DEFENSE_WEIGHTS.agilityPercent +
    safeNum(buffs.intelligencePercent) * FACTION_DEFENSE_WEIGHTS.intelligencePercent
  ) / 100;

  return Math.floor(
    safeNum(playerPower) * factionMultiplier +
    safeNum(gangTotalPower) * GANG_CONTRIBUTION_FACTOR
  );
}

// ─────────────────────────────────────────────
// CHANCE DE VITÓRIA
// Sempre entre 30% e 90% — nunca garantido
// ─────────────────────────────────────────────
export function calculateWinChance(attackerEffPower, defenderEffPower) {
  const total = Math.max(1, safeNum(attackerEffPower) + safeNum(defenderEffPower));
  const raw   = safeNum(attackerEffPower) / total;
  return Math.min(0.90, Math.max(0.30, raw));
}

// ─────────────────────────────────────────────
// LOOT
// ─────────────────────────────────────────────
const LOOT_CAPS_BY_LEVEL = [
  [9,  20_000],
  [19, 50_000],
  [29, 120_000],
  [39, 300_000],
  [49, 700_000],
  [59, 1_500_000],
  [69, 3_000_000],
  [79, 6_000_000],
  [89, 10_000_000],
  [Infinity, 20_000_000],
];

export function getLootCapByLevel(level) {
  const l = safeNum(level, 1);
  for (const [cap, value] of LOOT_CAPS_BY_LEVEL) {
    if (l <= cap) return value;
  }
  return 20_000_000;
}

export function calculateLoot(defenderDirtyMoney, defenderLevel, isCritical, lootModifier = 1) {
  const exposed  = safeNum(defenderDirtyMoney) * 0.40;
  const baseRate = isCritical ? 0.25 : 0.15;
  const raw      = Math.floor(exposed * baseRate * Math.max(0.4, Math.min(2.5, lootModifier)));
  const cap      = getLootCapByLevel(defenderLevel);
  return Math.min(raw, cap);
}

// ─────────────────────────────────────────────
// BREAKDOWNS (para UI e logs)
// ─────────────────────────────────────────────
export function buildPowerBreakdown(player, gangTotalPower, factionBuffs) {
  const base      = calculateBasePower(player);
  const enhanced  = calculateEnhancedPower(player);
  const weaponBon = calculateWeaponBonus(player);
  const accBon    = calculateAccessoryBonus(player);

  const attackEff = calculateEffectiveAttackerPower(enhanced, factionBuffs, gangTotalPower);
  const defEff    = calculateEffectiveDefenderPower(enhanced, factionBuffs, gangTotalPower);

  return {
    basePower: base,
    enhancedPower: enhanced,
    gangContribution: Math.floor(safeNum(gangTotalPower) * GANG_CONTRIBUTION_FACTOR),
    effectiveAttack: attackEff,
    effectiveDefense: defEff,
    sources: {
      skills:      base,
      weapons:     Math.floor(enhanced * (weaponBon.attackBonus / 100)),
      accessories: enhanced - base,
      gang:        Math.floor(safeNum(gangTotalPower) * GANG_CONTRIBUTION_FACTOR),
      faction:     attackEff - enhanced - Math.floor(safeNum(gangTotalPower) * GANG_CONTRIBUTION_FACTOR),
    },
    weaponBonus: weaponBon,
    accessoryBonus: accBon,
  };
}
