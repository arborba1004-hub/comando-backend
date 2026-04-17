/**
 * COMMANDIA — Gang Talents System
 * Define os 8 talentos especiais de cada tipo de membro
 */

exports.GANG_TALENTS = {
  COLETE: {
    name: 'Colete',
    type: 'muralha',
    description: 'Reduz dano recebido de Certeiros e Wifis em 30%',
    effect: (damage, attacker, defender) => {
      if ((attacker.type === 'certeiro' || attacker.type === 'wifi') &&
          defender.type === 'muralha') {
        return damage * 0.7;
      }
      return damage;
    },
  },

  COBERTURA: {
    name: 'Cobertura',
    type: 'motorista',
    description: '+Blindagem ao atacar território alheio; alto Fôlego',
    effect: (stats, context) => {
      if (context?.isAttackingTerritory) {
        return {
          ...stats,
          blindagem: Math.floor(stats.blindagem * 1.2),
        };
      }
      return stats;
    },
  },

  PORRADA: {
    name: 'Porrada',
    type: 'frente',
    description: 'Dano crítico vs Capangas; chance de causar 3× dano',
    criticalChance: 0.2,
    effect: (damage, attacker, defender) => {
      if (attacker.type === 'frente' && defender.type === 'capanga') {
        if (Math.random() < 0.2) {
          return damage * 3;
        }
      }
      return damage;
    },
  },

  TURBO: {
    name: 'Turbo',
    type: 'nitro',
    description: 'Alta velocidade; talento BONDE — ataca diretamente camadas 5-8',
    hasBonde: true,
    effect: (stats) => stats,
  },

  BONDE: {
    name: 'Bonde',
    type: 'capanga',
    description: 'Bypassa camadas 1-4 e ataca ranged; bônus ao saquear recursos',
    hasBonde: true,
    bondeLayers: [5, 6, 7, 8],
    lootBonus: 0.15,
    effect: (stats) => stats,
  },

  FOGO_DUPLO: {
    name: 'Fogo Duplo',
    type: 'wifi',
    description: 'Velocidade de ataque 2×; menos efetivo vs Muralhas',
    attackSpeed: 2,
    effect: (damage, attacker, defender) => {
      if (defender.type === 'muralha') {
        return damage * 0.75;
      }
      return damage;
    },
  },

  MIRA: {
    name: 'Mira',
    type: 'certeiro',
    description: '+Ataque na defesa do território; alcance extremo',
    effect: (stats, context) => {
      if (context?.isDefending) {
        return {
          ...stats,
          rajada: Math.floor(stats.rajada * 1.25),
        };
      }
      return stats;
    },
  },

  PESADO: {
    name: 'Pesado',
    type: 'executor',
    description: 'Altíssimo dano; velocidade baixa; +Ataque ao invadir barraco',
    attackSpeed: 0.5,
    effect: (stats, context) => {
      if (context?.isInvadingBarrack) {
        return {
          ...stats,
          rajada: Math.floor(stats.rajada * 1.4),
        };
      }
      return stats;
    },
  },
};

exports.getTalentByType = function(type) {
  const talentKey = Object.keys(exports.GANG_TALENTS).find(
    key => exports.GANG_TALENTS[key].type === type
  );
  return talentKey ? exports.GANG_TALENTS[talentKey] : null;
};

exports.hasBonde = function(member) {
  const talent = exports.getTalentByType(member.type);
  return talent?.hasBonde === true;
};

exports.applyTalentDamageBonus = function(damage, attacker, defender, context = {}) {
  const talent = exports.getTalentByType(attacker.type);
  if (!talent || !talent.effect) return damage;

  const result = talent.effect(damage, attacker, defender, context);
  return typeof result === 'number' ? result : damage;
};

exports.applyTalentStatsBonus = function(stats, member, context = {}) {
  const talent = exports.getTalentByType(member.type);
  if (!talent || !talent.effect) return stats;

  const result = talent.effect(stats, context);
  return typeof result === 'object' ? result : stats;
};
