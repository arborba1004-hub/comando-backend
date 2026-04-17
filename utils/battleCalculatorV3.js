/**
 * COMMANDIA — Battle Calculator V3
 * Resolve batalhas por CAMADAS com sistema BONDE
 */

const memberTypes = require('./gangMemberTypes');
const talents = require('./gangTalents');
const formations = require('./formations');

const MAX_ROUNDS = 100;

function organizeByLayers(members) {
  const layers = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
  if (!Array.isArray(members)) return layers;

  members.forEach(member => {
    if (member && member.layer >= 1 && member.layer <= 8) {
      layers[member.layer].push({
        ...member,
        status: member.status || 'ativo',
      });
    }
  });

  return layers;
}

function hasActiveTroops(byLayers) {
  for (let layer = 1; layer <= 8; layer++) {
    const layer_troops = byLayers[layer] || [];
    if (layer_troops.some(m => m.status === 'ativo')) {
      return true;
    }
  }
  return false;
}

function getRandomTarget(targets) {
  if (!Array.isArray(targets) || targets.length === 0) return null;
  return targets[Math.floor(Math.random() * targets.length)];
}

function applyDamageToMember(target, damage, casualties) {
  if (!target) return;

  if (damage < (target.folego || 1)) {
    target.status = 'ferido';
    target.injuryEndsAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    if (!casualties.feridos[target.type]) casualties.feridos[target.type] = 0;
    casualties.feridos[target.type]++;
  } else {
    target.status = 'morto';
    target.injuryEndsAt = null;
    if (!casualties.mortos[target.type]) casualties.mortos[target.type] = 0;
    casualties.mortos[target.type]++;
  }
}

exports.resolveBattle = function(options) {
  const { attackerMembers, defenderMembers, attackerFormation, defenderFormation } = options;

  const attackerCasualties = { mortos: {}, feridos: {} };
  const defenderCasualties = { mortos: {}, feridos: {} };

  const attackerByLayer = organizeByLayers(attackerMembers);
  const defenderByLayer = organizeByLayers(defenderMembers);

  let round = 0;

  while (
    hasActiveTroops(attackerByLayer) &&
    hasActiveTroops(defenderByLayer) &&
    round < MAX_ROUNDS
  ) {
    round++;

    // Combate normal
    for (let layer = 1; layer <= 8; layer++) {
      const attackers = attackerByLayer[layer] || [];
      attackers.forEach(attacker => {
        if (attacker.status !== 'ativo') return;

        const max_target_layer = Math.min(8, layer + (attacker.range || 1));
        for (let target_layer = 1; target_layer <= max_target_layer; target_layer++) {
          const potential_targets = (defenderByLayer[target_layer] || []).filter(
            m => m.status === 'ativo'
          );

          if (potential_targets.length > 0) {
            const target = getRandomTarget(potential_targets);
            if (target) {
              let damage = memberTypes.calculateDamage(attacker, target);
              applyDamageToMember(target, damage, defenderCasualties);
              break;
            }
          }
        }
      });
    }

    // Contraataque
    for (let layer = 1; layer <= 8; layer++) {
      const defenders = defenderByLayer[layer] || [];
      defenders.forEach(defender => {
        if (defender.status !== 'ativo') return;

        const max_target_layer = Math.min(8, layer + (defender.range || 1));
        for (let target_layer = 1; target_layer <= max_target_layer; target_layer++) {
          const potential_targets = (attackerByLayer[target_layer] || []).filter(
            m => m.status === 'ativo'
          );

          if (potential_targets.length > 0) {
            const target = getRandomTarget(potential_targets);
            if (target) {
              let damage = memberTypes.calculateDamage(defender, target);
              applyDamageToMember(target, damage, attackerCasualties);
              break;
            }
          }
        }
      });
    }
  }

  return {
    roundsFought: round,
    attackerCasualties,
    defenderCasualties,
    winner: hasActiveTroops(attackerByLayer) ? 'attacker' : 'defender',
    attackerAliveCount: Object.values(attackerByLayer)
      .flat()
      .filter(m => m.status === 'ativo').length,
    defenderAliveCount: Object.values(defenderByLayer)
      .flat()
      .filter(m => m.status === 'ativo').length,
  };
};

exports.calculateCombatPower = function(members) {
  let power = 0;

  if (Array.isArray(members)) {
    members.forEach(member => {
      if (member.status === 'ativo') {
        power += (member.rajada || 0) * 1.15;
        power += (member.blindagem || 0) * 1.05;
        power += (member.folego || 0) * 0.95;
        power += (member.quebra || 1) * 120;
      }
    });
  }

  return Math.floor(power);
};
