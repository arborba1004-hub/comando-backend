/**
 * COMMANDIA — Formations System
 * Define as 5 formações com seus modificadores de stat
 */

exports.FORMATIONS = {
  pressao_total: {
    name: 'Pressão Total',
    description: 'Ataque agressivo máximo — máximo dano',
    modifiers: {
      rajada: 0.18,
      blindagem: -0.08,
      folego: -0.04,
      quebra: 0.14,
      casualtyReduction: -0.06,
      mobility: 0.06,
    },
  },

  linha_fechada: {
    name: 'Linha Fechada',
    description: 'Defesa equilibrada com DPS moderado',
    modifiers: {
      rajada: -0.06,
      blindagem: 0.20,
      folego: 0.10,
      quebra: -0.04,
      casualtyReduction: 0.12,
      medicBonus: 0.10,
      mobility: -0.04,
    },
  },

  bote_certo: {
    name: 'Bote Certo',
    description: 'Melhor equilíbrio ataque/saque — uso geral',
    modifiers: {
      rajada: 0.10,
      blindagem: 0,
      folego: 0,
      quebra: 0.10,
      saque: 0.08,
      casualtyReduction: 0,
      mobility: 0.08,
    },
  },

  cerco: {
    name: 'Cerco',
    description: 'Guerras de facção longas, battles de resistência',
    modifiers: {
      rajada: 0.06,
      blindagem: 0.08,
      folego: 0.06,
      quebra: 0.06,
      casualtyReduction: 0.06,
      medicBonus: 0.06,
      mobility: 0,
    },
  },

  saque_rapido: {
    name: 'Saque Rápido',
    description: 'Roubar dinheiro sujo de jogadores sem gangue forte',
    modifiers: {
      rajada: 0,
      blindagem: -0.06,
      folego: -0.02,
      quebra: 0.04,
      saque: 0.22,
      casualtyReduction: -0.04,
      mobility: 0.10,
    },
  },
};

exports.getFormation = function(formationKey) {
  return exports.FORMATIONS[formationKey] || exports.FORMATIONS.bote_certo;
};

exports.applyFormationBonus = function(memberStats, formationKey) {
  const formation = exports.getFormation(formationKey);
  if (!formation) return memberStats;

  return {
    ...memberStats,
    rajada: Math.floor(memberStats.rajada * (1 + formation.modifiers.rajada)),
    blindagem: Math.floor(memberStats.blindagem * (1 + formation.modifiers.blindagem)),
    folego: Math.floor(memberStats.folego * (1 + formation.modifiers.folego)),
    quebra: memberStats.quebra * (1 + formation.modifiers.quebra),
  };
};

exports.getAllFormations = function() {
  return Object.entries(exports.FORMATIONS).map(([key, formation]) => ({
    key,
    ...formation,
  }));
};

exports.isValidFormation = function(formationKey) {
  return formationKey in exports.FORMATIONS;
};
