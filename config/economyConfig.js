/**
 * config/economyConfig.js
 *
 * Balanceamento central do Commandia.
 * Regra de linguagem/economia:
 * - Corre = atividade criminosa / energia do Giro no Asfalto.
 * - Commands Sujo = ganho bruto do corre e insumo de treino/lavagem.
 * - Commands Limpo = dinheiro lavado usado para evolução.
 *
 * Não existe recurso separado chamado "spins" ou "giros".
 */

export const ECONOMY = Object.freeze({
  STARTER: Object.freeze({
    corre: 100,
    dirtyMoney: 35_000,
    cleanMoney: 2_500,
  }),

  CORRE: Object.freeze({
    regenPerHour: 5,
    regenSoftCap: 60,
    dailyRewards: Object.freeze([
      { day: 1, corre: 20, dirtyMoney: 0, cleanMoney: 0, chest: null },
      { day: 2, corre: 25, dirtyMoney: 0, cleanMoney: 0, chest: null },
      { day: 3, corre: 30, dirtyMoney: 3_000, cleanMoney: 0, chest: null },
      { day: 4, corre: 35, dirtyMoney: 0, cleanMoney: 0, chest: null },
      { day: 5, corre: 40, dirtyMoney: 0, cleanMoney: 0, chest: null },
      { day: 6, corre: 50, dirtyMoney: 5_000, cleanMoney: 0, chest: 'common' },
      { day: 7, corre: 70, dirtyMoney: 10_000, cleanMoney: 500, chest: 'rare' },
    ]),

    // Mantém o pedido de corres da facção como já existe no chat:
    // 10 Corres no total, 1 por membro.
    factionRequestAmount: 10,
    factionDonationPerMember: 1,
  }),

  GIRO: Object.freeze({
    multipliers: Object.freeze([1, 2, 5, 10, 25, 50]),
    minSpinIntervalMs: 650,
    rateWindowMs: 60_000,
    maxSpinsPerWindow: 34,

    baseRewards: Object.freeze({
      common: 120,
      small: 350,
      medium: 850,
      big: 1_800,
      jackpot: 6_000,
    }),

    // Pesos internos, não percentuais exatos. O risco de polícia recebe bônus por aposta alta.
    outcomeWeights: Object.freeze({
      jackpot: 12,
      big: 45,
      medium: 120,
      small: 300,
      common: 463,
      prison: 60,
    }),

    multiplierRisk: Object.freeze({
      1: { extraPrisonWeight: 0, riskPercent: 10, label: 'Seguro' },
      2: { extraPrisonWeight: 10, riskPercent: 20, label: 'Baixo' },
      5: { extraPrisonWeight: 30, riskPercent: 35, label: 'Médio' },
      10: { extraPrisonWeight: 60, riskPercent: 52, label: 'Arriscado' },
      25: { extraPrisonWeight: 100, riskPercent: 72, label: 'Perigoso' },
      50: { extraPrisonWeight: 150, riskPercent: 92, label: 'Tudo ou nada' },
    }),

    prison: Object.freeze({
      windowMs: 5 * 60_000,
      baseLossPct: 0.05,
      lossStepPct: 0.03,
      maxLossPct: 0.20,
      cooldownsMs: Object.freeze([0, 0, 5_000, 15_000, 30_000, 60_000]),
    }),

    cardDrop: Object.freeze({
      commonChance: 0.08,
      rareChanceOnBig: 0.18,
      rareChanceOnJackpot: 0.45,
    }),
  }),

  TRAINING: Object.freeze({
    baseCostDirty: 1_200,
    levelExponent: 1.25,
    quantityPerBarracoLevel: 10,
  }),

  LAUNDRY: Object.freeze({
    baseLimitPerBusiness: 500,
    levelExponent: 1.35,
    dailyBusinessLimit: 1,
  }),

  UPGRADES: Object.freeze({
    barracoBaseClean: 1_200,
    barracoExponent: 1.45,
    pageBaseClean: 800,
    pageExponent: 1.35,
  }),
});

export default ECONOMY;
