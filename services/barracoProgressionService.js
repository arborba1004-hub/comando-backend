/**
 * services/barracoProgressionService.js
 *
 * Regra oficial de evolução do barraco no backend.
 *
 * A evolução agora é temporizada:
 * - /barraco/upgrade inicia a obra, desconta dinheiro limpo e grava endsAt.
 * - /barraco/upgrade/claim finaliza quando o tempo acabar.
 * - /barraco/upgrade/accelerate já deixa o sistema pronto para aceleradores.
 *
 * A curva de custo foi preservada para não alterar a economia atual.
 */

export const MAX_BARRACO_LEVEL = 100;
export const BARRACO_BASE_COST_CLEAN = 500;
export const BARRACO_COST_MULTIPLIER = 1.115;

// Tempo base profissional: níveis iniciais rápidos, níveis altos relevantes.
// Ex.: Nv.1->2 = 1 min; Nv.10 ≈ 4 min; Nv.30 ≈ 2h; Nv.50+ capado em 72h.
export const BARRACO_BASE_UPGRADE_DURATION_MS = 60 * 1000;
export const BARRACO_DURATION_MULTIPLIER = 1.18;
export const BARRACO_MAX_UPGRADE_DURATION_MS = 72 * 60 * 60 * 1000;

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeLevel(value, fallback = 1) {
  return Math.max(1, Math.floor(toNumber(value, fallback)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseIsoTime(value) {
  const time = new Date(value || '').getTime();
  return Number.isFinite(time) ? time : 0;
}

export function getBarracoUpgradeCost(level) {
  const safeLevel = normalizeLevel(level, 1);
  return Math.floor(
    BARRACO_BASE_COST_CLEAN * Math.pow(BARRACO_COST_MULTIPLIER, Math.max(0, safeLevel - 1))
  );
}

export function getBarracoUpgradeDurationMs(level) {
  const safeLevel = normalizeLevel(level, 1);
  const rawDuration = Math.floor(
    BARRACO_BASE_UPGRADE_DURATION_MS * Math.pow(BARRACO_DURATION_MULTIPLIER, Math.max(0, safeLevel - 1))
  );

  return clamp(rawDuration, BARRACO_BASE_UPGRADE_DURATION_MS, BARRACO_MAX_UPGRADE_DURATION_MS);
}

export function formatDurationMs(durationMs = 0) {
  const totalSeconds = Math.max(0, Math.ceil(toNumber(durationMs, 0) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function getBarracoName(level) {
  const safeLevel = normalizeLevel(level, 1);

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

export function normalizeBarracoUpgradeState(input = {}) {
  const active = input?.active === true;
  const status = ['idle', 'building', 'ready', 'completed'].includes(String(input?.status))
    ? String(input.status)
    : active
      ? 'building'
      : 'idle';
  const startedAt = input?.startedAt ? String(input.startedAt) : null;
  const endsAt = input?.endsAt ? String(input.endsAt) : null;
  const completedAt = input?.completedAt ? String(input.completedAt) : null;
  const durationMs = Math.max(0, Math.floor(toNumber(input?.durationMs, 0)));
  const remainingMs = active && endsAt
    ? Math.max(0, parseIsoTime(endsAt) - Date.now())
    : 0;

  return {
    active,
    status: active && remainingMs <= 0 && status === 'building' ? 'ready' : status,
    fromLevel: normalizeLevel(input?.fromLevel, 1),
    toLevel: normalizeLevel(input?.toLevel, 1),
    cost: Math.max(0, Math.floor(toNumber(input?.cost, 0))),
    durationMs,
    startedAt,
    endsAt,
    completedAt,
    acceleratedMs: Math.max(0, Math.floor(toNumber(input?.acceleratedMs, 0))),
    remainingMs,
  };
}

export function getBarracoUpgradeStatus(player = {}) {
  const operation = normalizeBarracoUpgradeState(player?.barracoUpgrade || {});

  return {
    operation,
    hasActiveUpgrade: operation.active === true,
    isReady: operation.active === true && operation.remainingMs <= 0,
    remainingMs: operation.remainingMs,
    remainingText: formatDurationMs(operation.remainingMs),
  };
}

export function buildBarracoUpgradeOperation({ fromLevel, toLevel, cost, durationMs, now = Date.now() }) {
  const startedAtMs = Number.isFinite(now) ? now : Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const endsAt = new Date(startedAtMs + Math.max(0, Math.floor(durationMs))).toISOString();

  return {
    active: true,
    status: 'building',
    fromLevel: normalizeLevel(fromLevel, 1),
    toLevel: normalizeLevel(toLevel, 1),
    cost: Math.max(0, Math.floor(toNumber(cost, 0))),
    durationMs: Math.max(0, Math.floor(toNumber(durationMs, 0))),
    startedAt,
    endsAt,
    completedAt: null,
    acceleratedMs: 0,
  };
}

export function getBarracoUpgradeRequirements(player = {}) {
  const barracoLevel = normalizeLevel(player?.niveis?.barracoLevel, 1);
  const cleanMoney = Math.max(0, toNumber(player?.balances?.cleanMoney, 0));
  const lavagemLevel = normalizeLevel(
    player?.pageLevels?.lavagem ?? player?.niveis?.lavagemLevel,
    1
  );
  const luxuryLevel = normalizeLevel(
    player?.pageLevels?.luxury ?? player?.niveis?.luxuryLevel,
    1
  );
  const hierarchyLevel = normalizeLevel(
    player?.niveis?.hierarchyLevel ?? player?.pageLevels?.hierarchy,
    1
  );

  const upgradeStatus = getBarracoUpgradeStatus(player);
  const cost = getBarracoUpgradeCost(barracoLevel);
  const durationMs = getBarracoUpgradeDurationMs(barracoLevel);
  const nextLevel = Math.min(MAX_BARRACO_LEVEL, barracoLevel + 1);

  // Power continua existindo no player para mapa/ranking/batalha,
  // mas não bloqueia a evolução do barraco.
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
      key: 'upgradeInProgress',
      ok: upgradeStatus.hasActiveUpgrade !== true,
      reason: upgradeStatus.isReady
        ? 'Já existe uma evolução pronta para finalizar.'
        : `Seu barraco já está em evolução. Tempo restante: ${upgradeStatus.remainingText}.`,
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
    durationMs,
    durationText: formatDurationMs(durationMs),
    currentLevel: barracoLevel,
    nextLevel,
    maxLevel: MAX_BARRACO_LEVEL,
    upgradeStatus,
    requirements: {
      lavagem: lavagemRequirement,
      luxury: luxuryRequirement,
      hierarchy: hierarchyRequirement,
    },
  };
}
