/**
 * COMMANDIA — Gang Member Types
 * 
 * Define os 8 tipos canônicos de membros da gangue
 * com seus atributos base para cada nível (1-10)
 */

// ============================================================
// 1. DEFINIÇÕES DOS 8 TIPOS
// ============================================================

export const MEMBER_TYPE_CONFIG = {
  muralha: {
    name: 'Muralha',
    layer: 1,
    range: 1,
    talent: 'COLETE',
    hasBonde: false,
    description: 'Escudo frontal — absorve tudo, mata pouco',
    recruitmentCosts: [1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000, 45000, 65000],
    // Stats base por nível (1-10): rajada, blindagem, folego, quebra
    statsPerLevel: [
      { rajada: 6, blindagem: 14, folego: 8, quebra: 1.0 },
      { rajada: 8, blindagem: 19, folego: 9, quebra: 1.1 },
      { rajada: 10, blindagem: 25, folego: 11, quebra: 1.2 },
      { rajada: 12, blindagem: 33, folego: 14, quebra: 1.3 },
      { rajada: 16, blindagem: 42, folego: 17, quebra: 1.4 },
      { rajada: 20, blindagem: 52, folego: 21, quebra: 1.6 },
      { rajada: 25, blindagem: 65, folego: 26, quebra: 1.8 },
      { rajada: 30, blindagem: 80, folego: 31, quebra: 2.0 },
      { rajada: 37, blindagem: 97, folego: 38, quebra: 2.2 },
      { rajada: 45, blindagem: 118, folego: 46, quebra: 2.5 },
    ],
  },

  motorista: {
    name: 'Motorista',
    layer: 2,
    range: 1,
    talent: 'COBERTURA',
    hasBonde: false,
    description: 'Defesa secundária + bônus ao atacar território',
    recruitmentCosts: [1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000, 45000, 65000],
    statsPerLevel: [
      { rajada: 12, blindagem: 12, folego: 6, quebra: 1.0 },
      { rajada: 16, blindagem: 16, folego: 8, quebra: 1.1 },
      { rajada: 21, blindagem: 21, folego: 10, quebra: 1.2 },
      { rajada: 27, blindagem: 27, folego: 12, quebra: 1.3 },
      { rajada: 35, blindagem: 35, folego: 15, quebra: 1.4 },
      { rajada: 44, blindagem: 44, folego: 18, quebra: 1.6 },
      { rajada: 56, blindagem: 56, folego: 22, quebra: 1.8 },
      { rajada: 70, blindagem: 70, folego: 26, quebra: 2.0 },
      { rajada: 87, blindagem: 87, folego: 31, quebra: 2.2 },
      { rajada: 107, blindagem: 107, folego: 38, quebra: 2.5 },
    ],
  },

  frente: {
    name: 'Frente',
    layer: 3,
    range: 1,
    talent: 'PORRADA',
    hasBonde: false,
    description: 'Ataque pesado — especialidade vs Capangas',
    recruitmentCosts: [1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000, 45000, 65000],
    statsPerLevel: [
      { rajada: 20, blindagem: 9, folego: 5, quebra: 1.0 },
      { rajada: 26, blindagem: 12, folego: 6, quebra: 1.1 },
      { rajada: 34, blindagem: 15, folego: 8, quebra: 1.2 },
      { rajada: 44, blindagem: 19, folego: 10, quebra: 1.3 },
      { rajada: 57, blindagem: 24, folego: 13, quebra: 1.4 },
      { rajada: 72, blindagem: 30, folego: 16, quebra: 1.6 },
      { rajada: 91, blindagem: 38, folego: 20, quebra: 1.8 },
      { rajada: 114, blindagem: 47, folego: 24, quebra: 2.0 },
      { rajada: 141, blindagem: 58, folego: 29, quebra: 2.2 },
      { rajada: 174, blindagem: 72, folego: 36, quebra: 2.5 },
    ],
  },

  nitro: {
    name: 'Nitro',
    layer: 4,
    range: 1,
    talent: 'TURBO',
    hasBonde: true, // ← TEM BONDE
    description: 'Melee rápido — talento BONDE',
    recruitmentCosts: [1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000, 45000, 65000],
    statsPerLevel: [
      { rajada: 22, blindagem: 8, folego: 4, quebra: 1.0 },
      { rajada: 29, blindagem: 10, folego: 5, quebra: 1.1 },
      { rajada: 37, blindagem: 13, folego: 6, quebra: 1.2 },
      { rajada: 48, blindagem: 16, folego: 8, quebra: 1.3 },
      { rajada: 62, blindagem: 21, folego: 10, quebra: 1.4 },
      { rajada: 78, blindagem: 26, folego: 12, quebra: 1.6 },
      { rajada: 99, blindagem: 33, folego: 15, quebra: 1.8 },
      { rajada: 124, blindagem: 41, folego: 18, quebra: 2.0 },
      { rajada: 153, blindagem: 51, folego: 22, quebra: 2.2 },
      { rajada: 188, blindagem: 63, folego: 27, quebra: 2.5 },
    ],
  },

  capanga: {
    name: 'Capanga',
    layer: 5,
    range: 4,
    talent: 'BONDE',
    hasBonde: true, // ← TEM BONDE
    description: 'Ranged curto — talento BONDE',
    recruitmentCosts: [1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000, 45000, 65000],
    statsPerLevel: [
      { rajada: 28, blindagem: 7, folego: 4, quebra: 1.0 },
      { rajada: 36, blindagem: 9, folego: 5, quebra: 1.1 },
      { rajada: 47, blindagem: 11, folego: 6, quebra: 1.2 },
      { rajada: 60, blindagem: 14, folego: 7, quebra: 1.3 },
      { rajada: 76, blindagem: 17, folego: 8, quebra: 1.4 },
      { rajada: 96, blindagem: 21, folego: 10, quebra: 1.6 },
      { rajada: 121, blindagem: 26, folego: 12, quebra: 1.8 },
      { rajada: 150, blindagem: 32, folego: 14, quebra: 2.0 },
      { rajada: 185, blindagem: 39, folego: 17, quebra: 2.2 },
      { rajada: 226, blindagem: 47, folego: 20, quebra: 2.5 },
    ],
  },

  wifi: {
    name: 'Wifi',
    layer: 6,
    range: 5,
    talent: 'FOGO_DUPLO',
    hasBonde: false,
    description: 'Ranged médio — ataque duplo mas fraco vs escudo',
    recruitmentCosts: [1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000, 45000, 65000],
    statsPerLevel: [
      { rajada: 20, blindagem: 5, folego: 3, quebra: 1.0 },
      { rajada: 26, blindagem: 6, folego: 4, quebra: 1.1 },
      { rajada: 34, blindagem: 8, folego: 5, quebra: 1.2 },
      { rajada: 44, blindagem: 10, folego: 6, quebra: 1.3 },
      { rajada: 57, blindagem: 13, folego: 7, quebra: 1.4 },
      { rajada: 72, blindagem: 16, folego: 9, quebra: 1.6 },
      { rajada: 91, blindagem: 20, folego: 11, quebra: 1.8 },
      { rajada: 114, blindagem: 25, folego: 13, quebra: 2.0 },
      { rajada: 141, blindagem: 31, folego: 16, quebra: 2.2 },
      { rajada: 174, blindagem: 38, folego: 19, quebra: 2.5 },
    ],
  },

  certeiro: {
    name: 'Certeiro',
    layer: 7,
    range: 8,
    talent: 'MIRA',
    hasBonde: false,
    description: 'Ranged longo — poderoso na defesa',
    recruitmentCosts: [1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000, 45000, 65000],
    statsPerLevel: [
      { rajada: 35, blindagem: 6, folego: 3, quebra: 1.0 },
      { rajada: 46, blindagem: 8, folego: 4, quebra: 1.1 },
      { rajada: 60, blindagem: 10, folego: 5, quebra: 1.2 },
      { rajada: 77, blindagem: 13, folego: 6, quebra: 1.3 },
      { rajada: 99, blindagem: 16, folego: 8, quebra: 1.4 },
      { rajada: 125, blindagem: 20, folego: 10, quebra: 1.6 },
      { rajada: 158, blindagem: 25, folego: 12, quebra: 1.8 },
      { rajada: 199, blindagem: 31, folego: 15, quebra: 2.0 },
      { rajada: 246, blindagem: 38, folego: 18, quebra: 2.2 },
      { rajada: 304, blindagem: 47, folego: 22, quebra: 2.5 },
    ],
  },

  executor: {
    name: 'Executor',
    layer: 8,
    range: 10,
    talent: 'PESADO',
    hasBonde: false,
    description: 'Retaguarda — altíssimo ataque, bônus ao invadir',
    recruitmentCosts: [1200, 2000, 3500, 5500, 8500, 13000, 20000, 30000, 45000, 65000],
    statsPerLevel: [
      { rajada: 40, blindagem: 9, folego: 5, quebra: 1.0 },
      { rajada: 55, blindagem: 12, folego: 7, quebra: 1.1 },
      { rajada: 72, blindagem: 15, folego: 8, quebra: 1.2 },
      { rajada: 92, blindagem: 19, folego: 10, quebra: 1.3 },
      { rajada: 117, blindagem: 24, folego: 13, quebra: 1.4 },
      { rajada: 148, blindagem: 30, folego: 16, quebra: 1.6 },
      { rajada: 187, blindagem: 37, folego: 19, quebra: 1.8 },
      { rajada: 235, blindagem: 46, folego: 23, quebra: 2.0 },
      { rajada: 294, blindagem: 57, folego: 28, quebra: 2.2 },
      { rajada: 366, blindagem: 70, folego: 34, quebra: 2.5 },
    ],
  },

  // Tipos antigos (compatibilidade) — mapeados para tipos canônicos
  assassino: { _alias: 'frente', name: 'Assassino' },
  armeiro: { _alias: 'certeiro', name: 'Armeiro' },
  informante: { _alias: 'wifi', name: 'Informante' },
  medico: { _alias: 'motorista', name: 'Médico' },
  lavador: { _alias: 'capanga', name: 'Lavador' },
  ladrao: { _alias: 'executor', name: 'Ladrão' },
  negociador: { _alias: 'wifi', name: 'Negociador' },
};

// ============================================================
// 2. FUNÇÕES AUXILIARES
// ============================================================

/**
 * Obter config de um tipo (resolve alias)
 */
export function getTypeConfig(type) {
  let config = MEMBER_TYPE_CONFIG[type];

  // Se é alias, resolver
  if (config?._alias) {
    config = MEMBER_TYPE_CONFIG[config._alias];
  }

  return config;
}

/**
 * Obter stats base de um tipo/nível
 */
export function getBaseStats(type, level) {
  const config = getTypeConfig(type);
  if (!config) throw new Error(`Tipo desconhecido: ${type}`);

  const levelIndex = Math.max(0, Math.min(level - 1, 9));
  const stats = config.statsPerLevel[levelIndex];

  return {
    type,
    name: config.name,
    level,
    layer: config.layer,
    range: config.range,
    talent: config.talent,
    hasBonde: config.hasBonde,
    rajada: stats.rajada,
    blindagem: stats.blindagem,
    folego: stats.folego,
    quebra: stats.quebra,
  };
}

/**
 * Calcular stats com bônus de investimento
 */
export function calculateMemberStats(type, level, investmentBonuses = {}) {
  const baseStats = getBaseStats(type, level);

  // Investimentos aplicáveis a este tipo
  const typeBonus = investmentBonuses[`${type}Bonus`] || 1;
  const doctrinaCriminalBonus = investmentBonuses.doctrinaCriminalBonus || 1;
  const arsenalColetivoBonus = investmentBonuses.arsenalColetivoBonus || 1;

  // Aplicar multiplicadores
  const finalStats = {
    ...baseStats,
    rajada: Math.floor(baseStats.rajada * typeBonus * doctrinaCriminalBonus * arsenalColetivoBonus),
    blindagem: Math.floor(baseStats.blindagem * doctrinaCriminalBonus),
    folego: Math.floor(baseStats.folego * doctrinaCriminalBonus),
    quebra: baseStats.quebra * typeBonus * doctrinaCriminalBonus,
  };

  return finalStats;
}

/**
 * Calcular custo de recrutamento
 */
export function getRecruitmentCost(type, level) {
  const config = getTypeConfig(type);
  if (!config) throw new Error(`Tipo desconhecido: ${type}`);

  const levelIndex = Math.max(0, Math.min(level - 1, 9));
  return config.recruitmentCosts[levelIndex];
}

/**
 * Calcular dano entre dois membros (Rajada × Quebra) / Blindagem inimigo
 */
export function calculateDamage(attacker, defender) {
  if (!attacker || !defender) return 0;

  const rajada = attacker.rajada || 0;
  const quebra = attacker.quebra || 1;
  const blindagem = Math.max(1, defender.blindagem || 1);

  const rawDamage = (rajada * quebra) / blindagem;
  return Math.floor(rawDamage);
}

/**
 * Verificar se um membro está vivo e ativo
 */
export function isAlive(member) {
  return member && member.status !== 'morto';
}

/**
 * Verificar se um membro está pronto para combate
 */
export function isReadyForBattle(member) {
  return member && member.status === 'ativo';
}

/**
 * Obter todos os tipos canônicos (excluindo alias)
 */
export function getCanonicalTypes() {
  return Object.keys(MEMBER_TYPE_CONFIG).filter(
    key => !MEMBER_TYPE_CONFIG[key]._alias
  );
}

/**
 * Converter membro antigo para novo formato
 * (compatibilidade com dados antigos)
 */
export function migrateMember(oldMember) {
  const config = getTypeConfig(oldMember.type);
  if (!config) {
    // Se tipo desconhecido, tentar alias
    const alias = MEMBER_TYPE_CONFIG[oldMember.type]?._alias;
    if (alias) {
      oldMember.type = alias;
    }
  }

  const baseStats = getBaseStats(oldMember.type, oldMember.level || 1);

  return {
    ...oldMember,
    ...baseStats,
    status: oldMember.status || 'ativo',
  };
}

export default {
  MEMBER_TYPE_CONFIG,
  getTypeConfig,
  getBaseStats,
  calculateMemberStats,
  getRecruitmentCost,
  calculateDamage,
  isAlive,
  isReadyForBattle,
  getCanonicalTypes,
  migrateMember,
};
