// services/attack/resolveAttack.js

import {
  applyBarracoGangStatSourceToList,
  buildGangStatSnapshot,
  buildMemberStatSnapshot,
} from '../gangStatisticsService.js';

const MEMBER_TYPES = [
  'capanga', 'frente', 'executor', 'assassino',
  'muralha', 'certeiro', 'motorista', 'nitro',
];

// ─── ATRIBUTOS (rajada=ATQ, blindagem=DEF, folego=HP, quebra=DANO) ──────────
const ATRIBUTOS_GANG = {
  capanga:  {
    1:  { rajada: 9,  blindagem: 13, folego: 12, quebra: 8  },
    2:  { rajada: 10, blindagem: 15, folego: 14, quebra: 9  },
    3:  { rajada: 11, blindagem: 17, folego: 16, quebra: 10 },
    4:  { rajada: 13, blindagem: 19, folego: 18, quebra: 11 },
    5:  { rajada: 15, blindagem: 21, folego: 20, quebra: 12 },
    6:  { rajada: 17, blindagem: 23, folego: 22, quebra: 13 },
    7:  { rajada: 19, blindagem: 25, folego: 24, quebra: 14 },
    8:  { rajada: 21, blindagem: 27, folego: 26, quebra: 15 },
    9:  { rajada: 23, blindagem: 29, folego: 28, quebra: 16 },
    10: { rajada: 25, blindagem: 31, folego: 30, quebra: 17 },
  },
  frente: {
    1:  { rajada: 12, blindagem: 9,  folego: 10, quebra: 12 },
    2:  { rajada: 14, blindagem: 10, folego: 11, quebra: 14 },
    3:  { rajada: 16, blindagem: 11, folego: 12, quebra: 16 },
    4:  { rajada: 18, blindagem: 12, folego: 13, quebra: 18 },
    5:  { rajada: 20, blindagem: 14, folego: 15, quebra: 21 },
    6:  { rajada: 22, blindagem: 15, folego: 16, quebra: 23 },
    7:  { rajada: 25, blindagem: 17, folego: 18, quebra: 26 },
    8:  { rajada: 27, blindagem: 18, folego: 19, quebra: 28 },
    9:  { rajada: 30, blindagem: 20, folego: 21, quebra: 31 },
    10: { rajada: 32, blindagem: 22, folego: 23, quebra: 34 },
  },
  executor: {
    1:  { rajada: 11, blindagem: 7,  folego: 9,  quebra: 12 },
    2:  { rajada: 13, blindagem: 8,  folego: 10, quebra: 14 },
    3:  { rajada: 15, blindagem: 9,  folego: 11, quebra: 16 },
    4:  { rajada: 17, blindagem: 10, folego: 12, quebra: 18 },
    5:  { rajada: 19, blindagem: 11, folego: 13, quebra: 21 },
    6:  { rajada: 21, blindagem: 12, folego: 14, quebra: 23 },
    7:  { rajada: 24, blindagem: 13, folego: 15, quebra: 26 },
    8:  { rajada: 26, blindagem: 14, folego: 16, quebra: 29 },
    9:  { rajada: 29, blindagem: 15, folego: 17, quebra: 32 },
    10: { rajada: 31, blindagem: 16, folego: 18, quebra: 35 },
  },
  assassino: {
    1:  { rajada: 12, blindagem: 7,  folego: 8,  quebra: 13 },
    2:  { rajada: 14, blindagem: 8,  folego: 9,  quebra: 15 },
    3:  { rajada: 16, blindagem: 9,  folego: 10, quebra: 17 },
    4:  { rajada: 18, blindagem: 10, folego: 11, quebra: 20 },
    5:  { rajada: 20, blindagem: 11, folego: 12, quebra: 23 },
    6:  { rajada: 22, blindagem: 12, folego: 13, quebra: 26 },
    7:  { rajada: 25, blindagem: 13, folego: 14, quebra: 29 },
    8:  { rajada: 27, blindagem: 14, folego: 15, quebra: 32 },
    9:  { rajada: 30, blindagem: 15, folego: 16, quebra: 35 },
    10: { rajada: 33, blindagem: 16, folego: 17, quebra: 38 },
  },
  muralha: {
    1:  { rajada: 6,  blindagem: 15, folego: 16, quebra: 5  },
    2:  { rajada: 7,  blindagem: 17, folego: 18, quebra: 6  },
    3:  { rajada: 8,  blindagem: 19, folego: 20, quebra: 7  },
    4:  { rajada: 9,  blindagem: 21, folego: 22, quebra: 8  },
    5:  { rajada: 10, blindagem: 24, folego: 25, quebra: 9  },
    6:  { rajada: 11, blindagem: 26, folego: 27, quebra: 10 },
    7:  { rajada: 12, blindagem: 29, folego: 30, quebra: 11 },
    8:  { rajada: 13, blindagem: 31, folego: 32, quebra: 12 },
    9:  { rajada: 14, blindagem: 34, folego: 35, quebra: 13 },
    10: { rajada: 15, blindagem: 37, folego: 38, quebra: 14 },
  },
  certeiro: {
    1:  { rajada: 9,  blindagem: 10, folego: 10, quebra: 8  },
    2:  { rajada: 10, blindagem: 11, folego: 11, quebra: 9  },
    3:  { rajada: 11, blindagem: 12, folego: 12, quebra: 10 },
    4:  { rajada: 12, blindagem: 13, folego: 13, quebra: 11 },
    5:  { rajada: 13, blindagem: 15, folego: 14, quebra: 12 },
    6:  { rajada: 14, blindagem: 16, folego: 15, quebra: 13 },
    7:  { rajada: 16, blindagem: 18, folego: 17, quebra: 15 },
    8:  { rajada: 17, blindagem: 19, folego: 18, quebra: 16 },
    9:  { rajada: 19, blindagem: 21, folego: 20, quebra: 18 },
    10: { rajada: 21, blindagem: 23, folego: 22, quebra: 20 },
  },
  motorista: {
    1:  { rajada: 7,  blindagem: 14, folego: 14, quebra: 7  },
    2:  { rajada: 8,  blindagem: 16, folego: 16, quebra: 8  },
    3:  { rajada: 9,  blindagem: 18, folego: 18, quebra: 9  },
    4:  { rajada: 10, blindagem: 20, folego: 20, quebra: 10 },
    5:  { rajada: 11, blindagem: 23, folego: 23, quebra: 11 },
    6:  { rajada: 12, blindagem: 25, folego: 25, quebra: 12 },
    7:  { rajada: 13, blindagem: 28, folego: 28, quebra: 13 },
    8:  { rajada: 14, blindagem: 30, folego: 30, quebra: 14 },
    9:  { rajada: 15, blindagem: 33, folego: 33, quebra: 15 },
    10: { rajada: 17, blindagem: 36, folego: 36, quebra: 17 },
  },
  nitro: {
    1:  { rajada: 8,  blindagem: 13, folego: 15, quebra: 8  },
    2:  { rajada: 9,  blindagem: 15, folego: 17, quebra: 9  },
    3:  { rajada: 10, blindagem: 17, folego: 19, quebra: 10 },
    4:  { rajada: 11, blindagem: 19, folego: 21, quebra: 11 },
    5:  { rajada: 12, blindagem: 21, folego: 24, quebra: 12 },
    6:  { rajada: 13, blindagem: 23, folego: 26, quebra: 13 },
    7:  { rajada: 15, blindagem: 26, folego: 29, quebra: 15 },
    8:  { rajada: 17, blindagem: 28, folego: 32, quebra: 17 },
    9:  { rajada: 19, blindagem: 31, folego: 35, quebra: 19 },
    10: { rajada: 21, blindagem: 34, folego: 38, quebra: 21 },
  },
};

// ─── UTILS ───────────────────────────────────────────────────────────────────

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value, fallback = 1) {
  const n = Math.floor(toNumber(value, fallback));
  return n > 0 ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function emptyByType() {
  return Object.fromEntries(MEMBER_TYPES.map((t) => [t, 0]));
}

// ─── VIAGEM ───────────────────────────────────────────────────────────────────

/**
 * Capacidade máxima de tropas em um ataque.
 *
 * Curva: barraco contribui suavemente (+10 por nível). Modificadores de
 * pacote/investimento (capacityBonus, 0+) aumentam mais agressivamente.
 *
 *   capacidade = (100 + 10 × (barraco - 1)) × (1 + capacityBonus)
 *
 * Exemplos:
 *   barraco 1, sem bônus: 100
 *   barraco 50, sem bônus: 590
 *   barraco 50 + bônus 0.5: 885
 */
export function getBattleCapacity(barracoLevel, capacityBonus = 0) {
  const safeLevel = Math.max(1, toPositiveInt(barracoLevel, 1));
  const safeBonus = Math.max(0, toNumber(capacityBonus, 0));

  const base = 100 + 10 * (safeLevel - 1);
  return Math.floor(base * (1 + safeBonus));
}

/**
 * Tempo por tile da gangue, em ms.
 *
 * Curva: barraco influencia pouco (5% mais rápido por nível). Modificadores
 * de pacote/investimento (velocityBonus, 0-0.9) aceleram mais.
 *
 *   tempoBase = 5000 / (1 + 0.05 × (barraco - 1))
 *   tempoFinal = tempoBase × (1 - velocityBonus)
 *
 * Exemplos:
 *   barraco 1, sem bônus: 5000ms/tile
 *   barraco 50, sem bônus: ~1818ms/tile
 *   barraco 50 + bônus 0.5: ~909ms/tile
 */
export function getGangAttackTimePerTileMs(barracoLevel, velocityBonus = 0, baseTime = 5000) {
  const safeBase = Math.max(1, Math.floor(toNumber(baseTime, 5000)));
  const safeLevel = Math.max(1, toPositiveInt(barracoLevel, 1));
  const safeBonus = clamp(toNumber(velocityBonus, 0), 0, 0.9);

  const levelFactor = 1 + 0.05 * (safeLevel - 1);
  const baseSpeed   = safeBase / levelFactor;
  const withBonus   = baseSpeed * (1 - safeBonus);

  return Math.max(50, Math.floor(withBonus));
}

/**
 * Menor rota em tiles quando o comboio pode andar nas 8 direções:
 * diagonal, vertical e horizontal.
 *
 * Exemplo: (0,0) -> (5,3) = 5 movimentos:
 * (0,0), (1,1), (2,2), (3,3), (4,3), (5,3).
 */
export function buildShortestTileRoute(origin = {}, target = {}) {
  let x = Math.floor(toNumber(origin.tileX, 0));
  let y = Math.floor(toNumber(origin.tileY, 0));
  const tx = Math.floor(toNumber(target.tileX, 0));
  const ty = Math.floor(toNumber(target.tileY, 0));

  const route = [{ tileX: x, tileY: y }];

  while (x !== tx || y !== ty) {
    if (x < tx) x += 1;
    else if (x > tx) x -= 1;

    if (y < ty) y += 1;
    else if (y > ty) y -= 1;

    route.push({ tileX: x, tileY: y });
  }

  return route;
}

/**
 * Distância em tiles com diagonal permitida.
 * Como cada passo pode alterar X e Y ao mesmo tempo, a distância mínima é max(dx, dy).
 */
export function getRouteDistanceTiles(origin, target) {
  const dx = Math.abs(Math.floor(toNumber(target.tileX, 0)) - Math.floor(toNumber(origin.tileX, 0)));
  const dy = Math.abs(Math.floor(toNumber(target.tileY, 0)) - Math.floor(toNumber(origin.tileY, 0)));
  return Math.max(dx, dy);
}

/**
 * Calcula viagem completa: rota por tiles, tempo por tile e duração total.
 * Aceita velocityBonus opcional vindo de aceleradores/investimentos/loja.
 */
export function buildTravelMetrics({ origin, target, barracoLevel, velocityBonus = 0 }) {
  const routeTiles = buildShortestTileRoute(origin, target);
  const routeDistanceTiles = Math.max(0, routeTiles.length - 1);
  const timePerTileMs      = getGangAttackTimePerTileMs(barracoLevel, velocityBonus);
  const totalDurationMs    = routeDistanceTiles * timePerTileMs;
  return { routeTiles, routeDistanceTiles, timePerTileMs, totalDurationMs };
}

// ─── MEMBROS ATIVOS ───────────────────────────────────────────────────────────

function sortMembersByRecruitment(members = []) {
  return [...members].sort((a, b) =>
    String(a?.recruitedAt || '').localeCompare(String(b?.recruitedAt || ''))
  );
}

function getActiveMembers(player) {
  return Array.isArray(player?.gang?.members)
    ? sortMembersByRecruitment(player.gang.members.filter((m) => m.status === 'ativo'))
    : [];
}

function getAttackEligibleMembers(player, battleId = null) {
  if (!Array.isArray(player?.gang?.members)) return [];

  const safeBattleId = battleId ? String(battleId) : null;

  return sortMembersByRecruitment(
    player.gang.members.filter((m) => {
      if (m.status === 'ativo') return true;
      return Boolean(
        safeBattleId &&
        m.status === 'marchando' &&
        String(m.activeAttackId || '') === safeBattleId
      );
    })
  );
}

function asBattleActive(member) {
  return { ...member, status: 'ativo' };
}

function normalizeSelection(selection = {}) {
  const out = emptyByType();
  for (const t of MEMBER_TYPES) {
    out[t] = Math.max(0, Math.floor(toNumber(selection?.[t], 0)));
  }
  return out;
}

function resolveMemberIdsFromPool({ pool, selection, selectedMemberIds, capacity }) {
  const safeCapacity = Math.max(0, Math.floor(toNumber(capacity, 0)));
  const byId = new Map((pool || []).map((member) => [String(member.id), member]));

  if (Array.isArray(selectedMemberIds) && selectedMemberIds.length > 0) {
    const uniqueIds = [];
    const seen = new Set();

    for (const rawId of selectedMemberIds) {
      const id = String(rawId);
      if (seen.has(id) || !byId.has(id)) continue;
      seen.add(id);
      uniqueIds.push(id);
      if (uniqueIds.length >= safeCapacity) break;
    }

    return uniqueIds;
  }

  const safe = normalizeSelection(selection);
  const chosen = [];
  let used = 0;

  for (const type of MEMBER_TYPES) {
    const byType = (pool || []).filter((member) => member.type === type);
    const wanted = Math.min(safe[type], safeCapacity - used);

    for (let index = 0; index < wanted; index++) {
      if (!byType[index]) break;
      chosen.push(String(byType[index].id));
      used += 1;
    }
  }

  return chosen;
}

export function resolveSelectedMemberIdsForAttack({ attacker, selection, selectedMemberIds }) {
  const active   = getActiveMembers(attacker);
  const capacity = getBattleCapacity(attacker?.niveis?.barracoLevel || 1);

  return resolveMemberIdsFromPool({
    pool: active,
    selection,
    selectedMemberIds,
    capacity,
  });
}

// ─── STATS DE GANGUE ─────────────────────────────────────────────────────────

function computeGangStats(members, statSources = []) {
  return buildGangStatSnapshot(members, statSources).summary;
}

// ─── BAIXAS ───────────────────────────────────────────────────────────────────

function resolveGangCasualties({ members, ownStats, enemyStats, side }) {
  const mortos  = emptyByType();
  const feridos = emptyByType();
  const active  = (members || []).filter((m) => m.status === 'ativo');

  if (!active.length) return { mortos, feridos, preservadosPeloMedico: 0 };

  // Pressão inimiga vs proteção própria
  const pressure    = enemyStats.rajada * 1.05 + enemyStats.quebra * 1.10;
  const protection  = ownStats.blindagem * 0.90 + ownStats.folego  * 0.85;
  const ownPower    = Math.max(1, ownStats.totalPower);

  let lossRate = clamp(
    (pressure - protection * 0.55) / ownPower,
    0.04,
    0.65
  );

  // Atacante sofre 8% a mais de baixas que defensor
  lossRate *= (side === 'attacker' ? 1.08 : 0.94);
  lossRate  = clamp(lossRate, 0.04, 0.65);

  const totalCasualties = Math.max(
    0,
    Math.round(active.length * lossRate)
  );

  // Médico salva alguns
  const medSave = clamp(0.18 + (ownStats.medicalPower || 0) * 0.003, 0.18, 0.75);
  let preserved = 0;

  // Ordena por tipo (linha de frente cai primeiro)
  const PRIORITY = { muralha: 1, motorista: 2, frente: 3, nitro: 4, capanga: 5, certeiro: 6, executor: 7, assassino: 8 };
  const sorted   = [...active].sort(
    (a, b) => (PRIORITY[a.type] || 5) - (PRIORITY[b.type] || 5)
  );

  for (let i = 0; i < totalCasualties; i++) {
    const m = sorted[i % sorted.length];
    if (!m) continue;
    const t = MEMBER_TYPES.includes(String(m.type)) ? String(m.type) : 'capanga';

    if (Math.random() < medSave) {
      feridos[t]++;
      preserved++;
    } else {
      // Chance de morte vs ferimento
      const deathChance = clamp(0.52 - ownStats.blindagem * 0.0007 - ownStats.folego * 0.0009, 0.12, 0.72);
      if (Math.random() < deathChance) mortos[t]++;
      else feridos[t]++;
    }
  }

  return { mortos, feridos, preservadosPeloMedico: preserved };
}

// ─── BATALHA (round-by-round, Mafia City style) ───────────────────────────────

function getAtributos(type, level) {
  const safeType  = MEMBER_TYPES.includes(String(type)) ? String(type) : 'capanga';
  const safeLevel = clamp(toPositiveInt(level, 1), 1, 10);
  return ATRIBUTOS_GANG[safeType][safeLevel];
}

function buildBattleUnits(side, members, statSources = []) {
  return members.map((m, i) => {
    const snapshot = buildMemberStatSnapshot(m, statSources);
    const a = snapshot.effectiveStats;
    return {
      battleId:    `${side}_${m.id}_${i}`,
      persistedId: String(m.id),
      type:        String(m.type),
      side,
      level:       clamp(toPositiveInt(m.level, 1), 1, 10),
      rajada:      Math.max(1, a.rajada),
      blindagem:   Math.max(0, a.blindagem),
      quebra:      Math.max(0, a.quebra),
      folegoBase:  Math.max(1, a.folego),
      folegoAtual: Math.max(1, a.folego),
      baseAttributes: snapshot.baseAttributes,
      bonusPercent: snapshot.bonusPercent,
      bonusFlat: snapshot.bonusFlat,
      activeStatSources: snapshot.activeStatSources,
      damageDealt: 0,
    };
  });
}

function isAlive(u) { return u.folegoAtual > 0; }

function classifyStatus(u) {
  if (u.folegoAtual <= 0)          return 'morto';
  if (u.folegoAtual < u.folegoBase) return 'ferido';
  return 'ativo';
}

function countByStatus(units, status) {
  return units.filter((u) => classifyStatus(u) === status).length;
}

function summarizeComposition(members) {
  const out = emptyByType();
  for (const m of members) {
    if (MEMBER_TYPES.includes(String(m.type))) out[m.type]++;
  }
  return out;
}

function summarizeFinalComposition(units) {
  const out = emptyByType();
  for (const u of units) {
    if (isAlive(u) && MEMBER_TYPES.includes(String(u.type))) out[u.type]++;
  }
  return out;
}

function updateMembersAfterBattle(originalMembers, unitsMap, battleId = null) {
  const now = Date.now();
  const recoveryMs = 3_600_000;
  const safeBattleId = battleId ? String(battleId) : null;

  return originalMembers.map((member) => {
    const unit = unitsMap.get(String(member.id));
    const belongsToBattle = Boolean(
      safeBattleId &&
      String(member?.activeAttackId || '') === safeBattleId
    );

    if (!unit && !belongsToBattle) {
      return { ...member };
    }

    const nextStatus = unit ? classifyStatus(unit) : 'ativo';
    const next = {
      ...member,
      status: nextStatus,
      activeAttackId: null,
      marchingUntil: null,
    };

    if (nextStatus === 'ferido') {
      next.injuryEndsAt = new Date(now + recoveryMs).toISOString();
    } else {
      next.injuryEndsAt = null;
    }

    return next;
  });
}

// ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────

export function resolveAttackResult({ battleId = null, attacker, defender, selectedMemberIds = [], selection = {} }) {
  const attackerEligible = getAttackEligibleMembers(attacker, battleId);
  const defenderActive = getActiveMembers(defender);

  const attackerCapacityBonus = toNumber(attacker?.combatModifiers?.capacityBonus, 0);
  const defenderCapacityBonus = toNumber(defender?.combatModifiers?.capacityBonus, 0);

  const capacity         = getBattleCapacity(attacker?.niveis?.barracoLevel || 1, attackerCapacityBonus);
  const defenderCapacity = getBattleCapacity(defender?.niveis?.barracoLevel || 1, defenderCapacityBonus);

  const resolvedIds = resolveMemberIdsFromPool({
    pool: attackerEligible,
    selection,
    selectedMemberIds,
    capacity,
  });

  const attackerMarch = attackerEligible
    .filter((m) => resolvedIds.includes(String(m.id)))
    .slice(0, capacity)
    .map(asBattleActive);

  const defenderMarch = defenderActive
    .slice(0, defenderCapacity)
    .map(asBattleActive);

  // Stats pré-batalha (para winChance e relatório)
  const attackerStatSources = applyBarracoGangStatSourceToList(
    Array.isArray(attacker?.gang?.statSources) ? attacker.gang.statSources : [],
    attacker?.niveis?.barracoLevel || 1
  );
  const defenderStatSources = applyBarracoGangStatSourceToList(
    Array.isArray(defender?.gang?.statSources) ? defender.gang.statSources : [],
    defender?.niveis?.barracoLevel || 1
  );

  const attackerGangStats = computeGangStats(attackerMarch, attackerStatSources);
  const defenderGangStats = computeGangStats(defenderMarch, defenderStatSources);

  // WinChance: poder ofensivo do atacante vs poder defensivo do defensor
  const attackPower  = attackerGangStats.rajada * 1.20 + attackerGangStats.quebra  * 1.10;
  const defensePower = defenderGangStats.blindagem * 1.20 + defenderGangStats.folego * 1.05;
  const rawChance    = attackPower / Math.max(1, attackPower + defensePower);
  const winChance    = clamp(rawChance, 0.15, 0.85);

  // ── Round-by-round ──────────────────────────────────────────────────────
  const attackerUnits = buildBattleUnits('atacante', attackerMarch, attackerStatSources);
  const defenderUnits = buildBattleUnits('defensor', defenderMarch, defenderStatSources);

  const atkFolegoTotal = attackerUnits.reduce((s, u) => s + u.folegoBase, 0);
  const defFolegoTotal = defenderUnits.reduce((s, u) => s + u.folegoBase, 0);

  let rounds = 0;
  const MAX_ROUNDS = 10000;

  while (attackerUnits.some(isAlive) && defenderUnits.some(isAlive) && rounds < MAX_ROUNDS) {
    rounds++;
    const queue = [...attackerUnits, ...defenderUnits]
      .filter(isAlive)
      .sort((a, b) => (b.rajada + b.folegoAtual) - (a.rajada + a.folegoAtual));

    for (const actor of queue) {
      if (!isAlive(actor)) continue;
      const enemies = actor.side === 'atacante' ? defenderUnits : attackerUnits;
      const target  = enemies.find(isAlive);
      if (!target) break;

      const damage = Math.max(1, actor.rajada + actor.quebra - target.blindagem);
      target.folegoAtual  = Math.max(0, target.folegoAtual - damage);
      actor.damageDealt  += damage;
    }
  }

  // ── Determina vencedor ──────────────────────────────────────────────────
  const atkAlive  = attackerUnits.filter(isAlive).length;
  const defAlive  = defenderUnits.filter(isAlive).length;
  const atkFolego = attackerUnits.reduce((s, u) => s + u.folegoAtual, 0);
  const defFolego = defenderUnits.reduce((s, u) => s + u.folegoAtual, 0);
  const atkDamage = attackerUnits.reduce((s, u) => s + u.damageDealt, 0);
  const defDamage = defenderUnits.reduce((s, u) => s + u.damageDealt, 0);

  let winner = 'empate';
  if      (atkAlive > 0 && defAlive <= 0)  winner = 'atacante';
  else if (defAlive > 0 && atkAlive <= 0)  winner = 'defensor';
  else if (atkAlive > defAlive)            winner = 'atacante';
  else if (defAlive > atkAlive)            winner = 'defensor';
  else if (atkFolego > defFolego)          winner = 'atacante';
  else if (defFolego > atkFolego)          winner = 'defensor';
  else if (atkDamage > defDamage)          winner = 'atacante';
  else if (defDamage > atkDamage)          winner = 'defensor';

  const success  = winner === 'atacante';
  const critical = success && (atkAlive / Math.max(1, attackerUnits.length)) > 0.80;

  // ── Loot ────────────────────────────────────────────────────────────────
  const defenderDirtyMoney = Math.max(0, toNumber(defender?.balances?.dirtyMoney, 0));
  const exposedDirty  = defenderDirtyMoney * 0.40;
  const lootPercent   = success ? (critical ? randomBetween(0.20, 0.25) : randomBetween(0.10, 0.15)) : 0;
  const lootDirtyMoney = success ? Math.floor(Math.min(exposedDirty * lootPercent, exposedDirty)) : 0;
  const correLoot      = success ? (critical ? Math.floor(randomBetween(3, 5)) : Math.floor(randomBetween(1, 3))) : 0;
  const prestigeLoot   = success ? (critical ? 25 : 10) : 0;

  // ── Saldos atualizados ──────────────────────────────────────────────────
  const attackerDirtyMoney = Math.max(0, toNumber(attacker?.balances?.dirtyMoney, 0));
  const nextDirtyMoneyAtacante = success
    ? attackerDirtyMoney + lootDirtyMoney
    : attackerDirtyMoney;
  const nextDirtyMoneyDefensor = success
    ? Math.max(0, defenderDirtyMoney - lootDirtyMoney)
    : defenderDirtyMoney;

  // ── Baixas ───────────────────────────────────────────────────────────────
  const attackerGangLosses = resolveGangCasualties({
    members:   attackerMarch,
    ownStats:  attackerGangStats,
    enemyStats: defenderGangStats,
    side: 'attacker',
  });
  const defenderGangLosses = resolveGangCasualties({
    members:   defenderMarch,
    ownStats:  defenderGangStats,
    enemyStats: attackerGangStats,
    side: 'defender',
  });

  // ── IDs de mortos e feridos (para o controller atualizar status) ─────────
  const attackerUnitsMap = new Map(attackerUnits.map((u) => [u.persistedId, u]));
  const defenderUnitsMap = new Map(defenderUnits.map((u) => [u.persistedId, u]));

  const attackerDeadMemberIds    = attackerUnits.filter((u) => !isAlive(u)).map((u) => u.persistedId);
  const defenderDeadMemberIds    = defenderUnits.filter((u) => !isAlive(u)).map((u) => u.persistedId);
  const attackerInjuredMemberIds = attackerUnits.filter((u) => isAlive(u) && u.folegoAtual < u.folegoBase).map((u) => u.persistedId);
  const defenderInjuredMemberIds = defenderUnits.filter((u) => isAlive(u) && u.folegoAtual < u.folegoBase).map((u) => u.persistedId);

  // ── Atualiza membros no gang object ──────────────────────────────────────
  const nextAttackerMembers = updateMembersAfterBattle(
    Array.isArray(attacker?.gang?.members) ? clone(attacker.gang.members) : [],
    attackerUnitsMap,
    battleId
  );
  const nextDefenderMembers = updateMembersAfterBattle(
    Array.isArray(defender?.gang?.members) ? clone(defender.gang.members) : [],
    defenderUnitsMap
  );

  function recalcStats(members, statSources = []) {
    const safeMembers = Array.isArray(members) ? members : [];
    const snapshot = buildGangStatSnapshot(safeMembers, statSources);
    const totalLevels = safeMembers.reduce(
      (sum, member) => sum + clamp(toPositiveInt(member?.level, 1), 1, 10),
      0
    );

    return {
      totalMembers:    safeMembers.length,
      activeMembers:   safeMembers.filter((m) => m.status === 'ativo').length,
      injuredMembers:  safeMembers.filter((m) => m.status === 'ferido').length,
      deadMembers:     safeMembers.filter((m) => m.status === 'morto').length,
      trainingMembers: safeMembers.filter((m) => m.status === 'treinando').length,
      marchingMembers: safeMembers.filter((m) => m.status === 'marchando').length,
      totalPower:      snapshot.summary.totalPower,
      averageLevel: safeMembers.length > 0 ? Number((totalLevels / safeMembers.length).toFixed(2)) : 0,
    };
  }

  const message = success
      ? (critical ? 'ATAQUE CRÍTICO. O alvo foi esmagado.' : 'Ataque bem-sucedido. Território enfraquecido.')
    : 'Sua investida falhou. A defesa resistiu.';

  // ── Dados de composição para o relatório de e-mail ───────────────────────
  const attackerReport = {
    playerId:            String(attacker?._id || attacker?.id || ''),
    name:                String(attacker?.name || 'Atacante'),
    factionTag:          attacker?.factionId || null,
    coordinates:         { x: toNumber(attacker?.mapPosition?.tileX, 0), y: toNumber(attacker?.mapPosition?.tileY, 0) },
    barracoLevel:        Math.max(1, toPositiveInt(attacker?.niveis?.barracoLevel, 1)),
    tropasEliminadas:    countByStatus(defenderUnits, 'morto'),
    perdas:              countByStatus(attackerUnits, 'morto'),
    machucados:          countByStatus(attackerUnits, 'ferido'),
    vivos:               countByStatus(attackerUnits, 'ativo'),
    danoTotalCausado:    atkDamage,
    danoTotalRecebido:   defenderUnits.reduce((s, u) => s + u.damageDealt, 0),
    composicaoInicial:   summarizeComposition(attackerMarch),
    composicaoFinal:     summarizeFinalComposition(attackerUnits),
  };

  const defenderReport = {
    playerId:            String(defender?._id || defender?.id || ''),
    name:                String(defender?.name || 'Defensor'),
    factionTag:          defender?.factionId || null,
    coordinates:         { x: toNumber(defender?.mapPosition?.tileX, 0), y: toNumber(defender?.mapPosition?.tileY, 0) },
    barracoLevel:        Math.max(1, toPositiveInt(defender?.niveis?.barracoLevel, 1)),
    tropasEliminadas:    countByStatus(attackerUnits, 'morto'),
    perdas:              countByStatus(defenderUnits, 'morto'),
    machucados:          countByStatus(defenderUnits, 'ferido'),
    vivos:               countByStatus(defenderUnits, 'ativo'),
    danoTotalCausado:    defDamage,
    danoTotalRecebido:   attackerUnits.reduce((s, u) => s + u.damageDealt, 0),
    composicaoInicial:   summarizeComposition(defenderMarch),
    composicaoFinal:     summarizeFinalComposition(defenderUnits),
  };

  return {
    // ── Campos usados pelo controller (existentes) ─────────────────────────
    winner,
    rounds,
    lootDirtyMoney,
    barracoLevelPerdedor: Math.max(1, toPositiveInt(
      winner === 'atacante' ? defender?.niveis?.barracoLevel : attacker?.niveis?.barracoLevel,
      1
    )),
    nextDirtyMoneyAtacante,
    nextDirtyMoneyDefensor,
    attacker: attackerReport,
    defender: defenderReport,
    nextAttackerGang: {
      members:  nextAttackerMembers,
      stats:    recalcStats(nextAttackerMembers, attackerStatSources),
      statSources: attackerStatSources,
      statSnapshot: buildGangStatSnapshot(nextAttackerMembers, attackerStatSources),
      updatedAtIso: new Date().toISOString(),
    },
    nextDefenderGang: {
      members:  nextDefenderMembers,
      stats:    recalcStats(nextDefenderMembers, defenderStatSources),
      statSources: defenderStatSources,
      statSnapshot: buildGangStatSnapshot(nextDefenderMembers, defenderStatSources),
      updatedAtIso: new Date().toISOString(),
    },
    attackerDeadMemberIds,
    defenderDeadMemberIds,
    attackerInjuredMemberIds,
    defenderInjuredMemberIds,
    selectedMemberIds: resolvedIds,

    // ── Campos NOVOS para o frontend (resolution shape) ────────────────────
    success,
    critical,
    winChance,
    message,
    attackerGangStats,
    defenderGangStats,
    attackerGangLosses,
    defenderGangLosses,
    spoils: {
      dirtyMoneyLoot:          lootDirtyMoney,
      correLoot,
      prestigeLoot,
      brokenLuxuryItemId:      null,
      brokenLuxuryItemName:    null,
      brokenLuxuryItemValue:   null,
      luxuryConvertedDirtyMoney: 0,
    },
  };
}