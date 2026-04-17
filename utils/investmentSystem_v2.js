/**
 * COMMANDIA — Investment System V2
 * Define 26 investimentos em 6 categorias
 */

exports.INVESTMENT_CATEGORIES = {
  RESOURCES: 'resources',
  ENTERPRISES: 'enterprises',
  WEAPONS: 'weapons',
  CREW: 'crew',
  DEFENSE: 'defense',
  OPERATIONS: 'operations',
};

exports.ALL_INVESTMENTS = {
  // Categoria 1: RECURSOS (4)
  aceleracao_lavagem: {
    name: 'Aceleração de Lavagem',
    category: 'resources',
    costBase: 500,
    maxLevel: 5,
    costFormula: (level) => level * 500,
    benefitFormula: (level) => level * 0.05,
  },

  protecao_cofre: {
    name: 'Proteção do Cofre',
    category: 'resources',
    costBase: 800,
    maxLevel: 5,
    costFormula: (level) => level * 800,
    benefitFormula: (level) => level * 0.04,
  },

  reciclagem_rapida: {
    name: 'Reciclagem Rápida',
    category: 'resources',
    costBase: 600,
    maxLevel: 3,
    costFormula: (level) => level * 600,
    benefitFormula: (level) => level * 0.08,
  },

  logistica_criminal: {
    name: 'Logística Criminal',
    category: 'resources',
    costBase: 1000,
    maxLevel: 3,
    costFormula: (level) => level * 1000,
    benefitFormula: (level) => level * 0.10,
  },

  // Categoria 2: EMPREENDIMENTOS (6)
  construcao_acelerada: {
    name: 'Construção Acelerada',
    category: 'enterprises',
    costBase: 1500,
    maxLevel: 2,
  },

  recrutamento_massa: {
    name: 'Recrutamento em Massa',
    category: 'enterprises',
    costBase: 1200,
    maxLevel: 5,
  },

  expansao_hospital: {
    name: 'Expansão do Hospital',
    category: 'enterprises',
    costBase: 1800,
    maxLevel: 3,
  },

  recuperacao_rapida: {
    name: 'Recuperação Rápida',
    category: 'enterprises',
    costBase: 1400,
    maxLevel: 5,
  },

  reserva_estrategica: {
    name: 'Reserva Estratégica',
    category: 'enterprises',
    costBase: 900,
    maxLevel: 3,
  },

  mobilizacao_extra: {
    name: 'Mobilização Extra',
    category: 'enterprises',
    costBase: 5000,
    maxLevel: 3,
  },

  // Categoria 3: ARMAMENTOS (6)
  arsenal_coletivo: {
    name: 'Arsenal Coletivo',
    category: 'weapons',
    costBase: 8000,
    maxLevel: 5,
  },

  guerra_total: {
    name: 'Guerra Total',
    category: 'weapons',
    costBase: 15000,
    maxLevel: 3,
  },

  // Categoria 4: CAPACIDADES (6)
  recrutamento_ampliado: {
    name: 'Recrutamento Ampliado',
    category: 'crew',
    costBase: 3000,
    maxLevel: 5,
  },

  doutrina_criminal: {
    name: 'Doutrina Criminal',
    category: 'crew',
    costBase: 6000,
    maxLevel: 5,
  },

  tatica_bonde: {
    name: 'Tática de Bonde',
    category: 'crew',
    costBase: 8000,
    maxLevel: 5,
  },

  // Categoria 5: DEFESA (5)
  barricada_reforcada: {
    name: 'Barricada Reforçada',
    category: 'defense',
    costBase: 2500,
    maxLevel: 5,
  },

  primeiros_socorros: {
    name: 'Primeiros Socorros',
    category: 'defense',
    costBase: 5000,
    maxLevel: 5,
  },

  // Categoria 6: OPERAÇÕES (5)
  fortalecimento_ct: {
    name: 'Fortalecimento do CT',
    category: 'operations',
    costBase: 5000,
    maxLevel: 3,
  },

  contato_faccao: {
    name: 'Contato de Facção',
    category: 'operations',
    costBase: 8000,
    maxLevel: 3,
  },
};

exports.calculateUpgradeCost = function(investmentKey, fromLevel, toLevel) {
  const investment = exports.ALL_INVESTMENTS[investmentKey];
  if (!investment) throw new Error(`Investimento desconhecido: ${investmentKey}`);

  let totalCost = 0;
  for (let level = fromLevel + 1; level <= toLevel; level++) {
    totalCost += investment.costFormula(level);
  }
  return totalCost;
};

exports.getInvestmentBenefit = function(investmentKey, level) {
  const investment = exports.ALL_INVESTMENTS[investmentKey];
  if (!investment) throw new Error(`Investimento desconhecido: ${investmentKey}`);
  return investment.benefitFormula ? investment.benefitFormula(level) : 0;
};

exports.calculateGangInvestmentBuffs = function(investments = {}) {
  const buffs = {
    rajadaBonus: 1,
    blindagemBonus: 1,
    folegoBonus: 1,
    hospitalCapacity: 0,
    recoverySpeed: 1,
    trainingSpeed: 1,
    maxMembers: 0,
    bondeBonus: 1,
    defenseBonus: 1,
  };

  Object.entries(investments).forEach(([key, data]) => {
    const investment = exports.ALL_INVESTMENTS[key];
    const level = data.level || 0;

    if (level === 0 || !investment) return;

    if (key === 'arsenal_coletivo' || key === 'guerra_total') {
      buffs.rajadaBonus *= 1.15;
    }
    if (key === 'doutrina_criminal') {
      buffs.rajadaBonus *= 1.15;
      buffs.blindagemBonus *= 1.05;
      buffs.folegoBonus *= 0.95;
    }
    if (key === 'tatica_bonde') {
      buffs.bondeBonus *= 1.15;
    }
    if (key === 'expansao_hospital') {
      buffs.hospitalCapacity += level * 500;
    }
    if (key === 'recuperacao_rapida') {
      buffs.recoverySpeed *= 1.15;
    }
    if (key === 'recrutamento_massa') {
      buffs.trainingSpeed *= 1.15;
    }
    if (key === 'recrutamento_ampliado') {
      buffs.maxMembers += level * 2;
    }
    if (key === 'barricada_reforcada') {
      buffs.defenseBonus *= 1.15;
    }
  });

  return buffs;
};
