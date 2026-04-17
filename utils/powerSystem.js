/**
 * COMMANDIA — Power System
 * Cálculo de poder do jogador e da gangue
 */

export const SKILL_POWER_MULTIPLIERS = {
  attack: 1.4,
  defense: 1.2,
  vigor: 1.25,
  agility: 1.15,
  intelligence: 1.1,
  respect: 0.9,
};

export const GANG_POWER_MULTIPLIERS = {
  rajada: 1.15,
  blindagem: 1.05,
  folego: 0.95,
  quebra: 1.2,
  intelPower: 0.35,
  mobilityPower: 0.3,
  weaponPower: 0.4,
  coordinationPower: 0.25,
};

function safeNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function calculatePlayerPower(player) {
  if (!player || !player.skills) return 0;

  const skills = player.skills;

  const attackPower = safeNumber(skills.attack) * SKILL_POWER_MULTIPLIERS.attack;
  const defensePower = safeNumber(skills.defense) * SKILL_POWER_MULTIPLIERS.defense;
  const intelligencePower =
    safeNumber(skills.intelligence) * SKILL_POWER_MULTIPLIERS.intelligence;
  const agilityPower = safeNumber(skills.agility) * SKILL_POWER_MULTIPLIERS.agility;
  const respectPower = safeNumber(skills.respect) * SKILL_POWER_MULTIPLIERS.respect;
  const vigorPower = safeNumber(skills.vigor) * SKILL_POWER_MULTIPLIERS.vigor;

  const basePower = Math.floor(
    attackPower +
      defensePower +
      intelligencePower +
      agilityPower +
      respectPower +
      vigorPower
  );

  return Math.max(0, basePower);
}

export function calculateGangPower(members) {
  if (!Array.isArray(members) || members.length === 0) {
    return {
      totalPower: 0,
      breakdown: {
        rajada: 0,
        blindagem: 0,
        folego: 0,
        quebra: 0,
      },
    };
  }

  let rajadaPower = 0;
  let blindagemPower = 0;
  let folegoPower = 0;
  let quebraPower = 0;

  for (const member of members) {
    if (member?.status !== 'ativo') continue;

    rajadaPower += safeNumber(member.rajada);
    blindagemPower += safeNumber(member.blindagem);
    folegoPower += safeNumber(member.folego);
    quebraPower += safeNumber(member.quebra);
  }

  const totalPower = Math.floor(
    rajadaPower * GANG_POWER_MULTIPLIERS.rajada +
      blindagemPower * GANG_POWER_MULTIPLIERS.blindagem +
      folegoPower * GANG_POWER_MULTIPLIERS.folego +
      quebraPower * GANG_POWER_MULTIPLIERS.quebra
  );

  return {
    totalPower,
    breakdown: {
      rajada: rajadaPower,
      blindagem: blindagemPower,
      folego: folegoPower,
      quebra: quebraPower,
    },
  };
}

export function calculateWinChance(attackerPower, defenderPower) {
  const attacker = Math.max(0, safeNumber(attackerPower));
  const defender = Math.max(0, safeNumber(defenderPower));
  const totalPower = attacker + defender;

  if (totalPower <= 0) return 0.5;

  let chance = attacker / totalPower;
  chance = Math.max(0.3, Math.min(0.9, chance));
  return chance;
}

export function recalculatePlayerPower(player) {
  if (!player) return 0;

  const newPower = calculatePlayerPower(player);
  player.power = newPower;
  return newPower;
}

export function getLootCapByLevel(level = 1) {
  const safeLevel = Math.max(1, Math.floor(safeNumber(level, 1)));
  return 1000 + (safeLevel - 1) * 250;
}

export function calculateLoot(defenderDirtyMoney = 0, defenderLevel = 1, critical = false) {
  const dirtyMoney = Math.max(0, Math.floor(safeNumber(defenderDirtyMoney)));
  if (dirtyMoney <= 0) return 0;

  const basePercent = critical ? 0.18 : 0.12;
  const rawLoot = Math.floor(dirtyMoney * basePercent);
  const cap = getLootCapByLevel(defenderLevel);

  return Math.max(0, Math.min(rawLoot, cap, dirtyMoney));
}