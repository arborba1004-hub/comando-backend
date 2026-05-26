/**
 * services/barracoProgressionService.js
 *
 * Regra oficial de evolução do barraco no backend.
 *
 * IMPORTANTE:
 * - Este patch mantém exatamente a curva antiga que estava no frontend
 *   para não alterar a economia nem o saldo esperado dos jogadores atuais.
 * - O frontend pode continuar exibindo prévia, mas a decisão final de upgrade
 *   passa a ser sempre deste serviço no backend.
 */

export const MAX_BARRACO_LEVEL = 100;
export const BARRACO_BASE_COST_CLEAN = 500;
export const BARRACO_COST_MULTIPLIER = 1.115;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toLevel(value, fallback = 1) {
  return Math.max(1, Math.floor(toNumber(value, fallback)));
}

export function getBarracoUpgradeCost(level) {
  const safeLevel = toLevel(level, 1);
  return Math.floor(
    BARRACO_BASE_COST_CLEAN * Math.pow(BARRACO_COST_MULTIPLIER, Math.max(0, safeLevel - 1))
  );
}

export function getBarracoName(level) {
  const safeLevel = toLevel(level, 1);

  if (safeLevel >= 100) return 'Castelo do Comando';
  if (safeLevel >= 90) return 'Mansão com Heliporto';
  if (safeLevel >= 80) return 'Mansão Blindada';
  if (safeLevel >= 70) return 'Mansão do Complexo';
  if (safeLevel >= 60) return 'Triplex com Piscina';
  if (safeLevel >= 50) return 'Triplex Alto Padrão';
  if (safeLevel >= 40) return 'Sobrado de Luxo';
  if (safeLevel >= 30) return 'Sobrado com Piscina';
  if (safeLevel >= 20) return 'Sobrado';
  if (safeLevel >= 10) return 'Casa de Alvenaria';
  return 'Barraco Inicial';
}

export function getBarracoUpgradeRequirements(player = {}) {
  const barracoLevel = toLevel(player?.niveis?.barracoLevel, 1);
  const cleanMoney = Math.max(0, toNumber(player?.balances?.cleanMoney, 0));
  const lavagemLevel = toLevel(
    player?.pageLevels?.lavagem ?? player?.niveis?.lavagemLevel,
    1
  );
  const luxuryLevel = toLevel(
    player?.pageLevels?.luxury ?? player?.niveis?.luxuryLevel,
    1
  );
  const hierarchyLevel = toLevel(
    player?.niveis?.hierarchyLevel ?? player?.pageLevels?.hierarchy,
    1
  );

  const cost = getBarracoUpgradeCost(barracoLevel);
  const nextLevel = Math.min(MAX_BARRACO_LEVEL, barracoLevel + 1);

  // Power continua existindo no player para mapa, ranking e batalha,
  // mas não deve bloquear a evolução do barraco.
  // O barraco é limitado por economia e progressão lateral.

  const lavagemRequirement = Math.max(1, Math.floor(barracoLevel / 10));
  const luxuryRequirement = Math.max(1, Math.floor(barracoLevel / 12));
  const hierarchyRequirement = Math.max(1, Math.floor(barracoLevel / 15));

  const rules = [
    {
      key: 'maxLevel',
      ok: barracoLevel < MAX_BARRACO_LEVEL,
      reason: `Seu barraco já está no nível máximo (${MAX_BARRACO_LEVEL}).`,
    },
    {
      key: 'levelProgressionBlocked',
      ok: player?.punishments?.levelProgressionBlocked !== true,
      reason: 'A evolução de nível está bloqueada por uma punição ativa.',
    },
    {
      key: 'cleanMoney',
      ok: cleanMoney >= cost,
      reason: `Você precisa de ${cost.toLocaleString('pt-BR')} de dinheiro limpo.`,
    },
    {
      key: 'lavagem',
      ok: lavagemLevel >= lavagemRequirement,
      reason: `Sua lavagem está abaixo do necessário (${lavagemRequirement}). Atual: ${lavagemLevel}.`,
    },
    {
      key: 'luxury',
      ok: luxuryLevel >= luxuryRequirement,
      reason: `Seu nível de luxo está abaixo do necessário (${luxuryRequirement}). Atual: ${luxuryLevel}.`,
    },
    {
      key: 'hierarchy',
      ok: hierarchyLevel >= hierarchyRequirement,
      reason: `Sua hierarquia está abaixo do necessário (${hierarchyRequirement}). Atual: ${hierarchyLevel}.`,
    },
  ];

  const failedRule = rules.find((rule) => !rule.ok);

  return {
    allowed: !failedRule,
    reason: failedRule?.reason || '',
    failedKey: failedRule?.key || null,
    cost,
    currentLevel: barracoLevel,
    nextLevel,
    maxLevel: MAX_BARRACO_LEVEL,
    requirements: {
      lavagem: lavagemRequirement,
      luxury: luxuryRequirement,
      hierarchy: hierarchyRequirement,
    },
  };
}
