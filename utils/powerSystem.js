/**
 * COMMANDIA — Power System
 * Cálculo de poder do jogador e da gangue com todos os bônus
 */

exports.SKILL_POWER_MULTIPLIERS = {
  attack: 1.4,
  defense: 1.2,
  vigor: 1.25,
  agility: 1.15,
  intelligence: 1.1,
  respect: 0.9,
};

exports.GANG_POWER_MULTIPLIERS = {
  rajada: 1.15,
  blindagem: 1.05,
  folego: 0.95,
  quebra: 1.2,
  intelPower: 0.35,
  mobilityPower: 0.3,
  weaponPower: 0.4,
  coordinationPower: 0.25,
};

exports.calculatePlayerPower = function(player) {
  if (!player || !player.skills) return 0;

  const skills = player.skills;
  const multipliers = exports.SKILL_POWER_MULTIPLIERS;

  const attackPower = (skills.attack || 0) * multipliers.attack;
  const defensePower = (skills.defense || 0) * multipliers.defense;
  const intelligencePower = (skills.intelligence || 0) * multipliers.intelligence;
  const agilityPower = (skills.agility || 0) * multipliers.agility;
  const respectPower = (skills.respect || 0) * multipliers.respect;
  const vigorPower = (skills.vigor || 0) * multipliers.vigor;

  const basePower = Math.floor(
    attackPower + defensePower + intelligencePower +
    agilityPower + respectPower + vigorPower
  );

  return Math.max(0, basePower);
};

exports.calculateGangPower = function(members, formation = {}) {
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

  members.forEach(member => {
    if (member.status === 'ativo') {
      rajadaPower += member.rajada || 0;
      blindagemPower += member.blindagem || 0;
      folegoPower += member.folego || 0;
      quebraPower += (member.quebra || 1) * 100;
    }
  });

  const multipliers = exports.GANG_POWER_MULTIPLIERS;
  const totalPower = Math.floor(
    rajadaPower * multipliers.rajada +
    blindagemPower * multipliers.blindagem +
    folegoPower * multipliers.folego +
    (quebraPower / 100) * multipliers.quebra
  );

  return {
    totalPower,
    breakdown: {
      rajada: rajadaPower,
      blindagem: blindagemPower,
      folego: folegoPower,
      quebra: quebraPower / 100,
    },
  };
};

exports.calculateWinChance = function(attackerPower, defenderPower) {
  const totalPower = attackerPower + defenderPower;
  if (totalPower <= 0) return 0.5;

  let chance = attackerPower / totalPower;
  chance = Math.max(0.3, Math.min(0.9, chance));
  return chance;
};

exports.recalculatePlayerPower = function(player) {
  if (!player) return 0;
  const newPower = exports.calculatePlayerPower(player);
  player.power = newPower;
  return newPower;
};
