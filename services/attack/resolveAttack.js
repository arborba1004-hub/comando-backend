const MEMBER_TYPES = [
  'capanga',
  'frente',
  'executor',
  'assassino',
  'muralha',
  'certeiro',
  'motorista',
  'nitro',
];

const ATRIBUTOS_GANG = {
  capanga: {
    1: { rajada: 9, blindagem: 13, folego: 12, quebra: 8 },
    2: { rajada: 10, blindagem: 15, folego: 14, quebra: 9 },
    3: { rajada: 11, blindagem: 17, folego: 16, quebra: 10 },
    4: { rajada: 13, blindagem: 19, folego: 18, quebra: 11 },
    5: { rajada: 15, blindagem: 21, folego: 20, quebra: 12 },
    6: { rajada: 17, blindagem: 23, folego: 22, quebra: 13 },
    7: { rajada: 19, blindagem: 25, folego: 24, quebra: 14 },
    8: { rajada: 21, blindagem: 27, folego: 26, quebra: 15 },
    9: { rajada: 23, blindagem: 29, folego: 28, quebra: 16 },
    10: { rajada: 25, blindagem: 31, folego: 30, quebra: 17 },
  },
  frente: {
    1: { rajada: 12, blindagem: 9, folego: 10, quebra: 12 },
    2: { rajada: 14, blindagem: 10, folego: 11, quebra: 14 },
    3: { rajada: 16, blindagem: 11, folego: 12, quebra: 16 },
    4: { rajada: 18, blindagem: 12, folego: 13, quebra: 18 },
    5: { rajada: 20, blindagem: 14, folego: 15, quebra: 21 },
    6: { rajada: 22, blindagem: 15, folego: 16, quebra: 23 },
    7: { rajada: 25, blindagem: 17, folego: 18, quebra: 26 },
    8: { rajada: 27, blindagem: 18, folego: 19, quebra: 28 },
    9: { rajada: 30, blindagem: 20, folego: 21, quebra: 31 },
    10: { rajada: 32, blindagem: 22, folego: 23, quebra: 34 },
  },
  executor: {
    1: { rajada: 11, blindagem: 7, folego: 9, quebra: 12 },
    2: { rajada: 13, blindagem: 8, folego: 10, quebra: 14 },
    3: { rajada: 15, blindagem: 9, folego: 11, quebra: 16 },
    4: { rajada: 17, blindagem: 10, folego: 12, quebra: 18 },
    5: { rajada: 19, blindagem: 11, folego: 13, quebra: 21 },
    6: { rajada: 21, blindagem: 12, folego: 14, quebra: 23 },
    7: { rajada: 24, blindagem: 13, folego: 15, quebra: 26 },
    8: { rajada: 26, blindagem: 14, folego: 16, quebra: 29 },
    9: { rajada: 29, blindagem: 15, folego: 17, quebra: 32 },
    10: { rajada: 31, blindagem: 16, folego: 18, quebra: 35 },
  },
  assassino: {
    1: { rajada: 12, blindagem: 7, folego: 8, quebra: 13 },
    2: { rajada: 14, blindagem: 8, folego: 9, quebra: 15 },
    3: { rajada: 16, blindagem: 9, folego: 10, quebra: 17 },
    4: { rajada: 18, blindagem: 10, folego: 11, quebra: 20 },
    5: { rajada: 20, blindagem: 11, folego: 12, quebra: 23 },
    6: { rajada: 22, blindagem: 12, folego: 13, quebra: 26 },
    7: { rajada: 25, blindagem: 13, folego: 14, quebra: 29 },
    8: { rajada: 27, blindagem: 14, folego: 15, quebra: 32 },
    9: { rajada: 30, blindagem: 15, folego: 16, quebra: 35 },
    10: { rajada: 33, blindagem: 16, folego: 17, quebra: 38 },
  },
  muralha: {
    1: { rajada: 6, blindagem: 15, folego: 16, quebra: 5 },
    2: { rajada: 7, blindagem: 17, folego: 18, quebra: 6 },
    3: { rajada: 8, blindagem: 19, folego: 20, quebra: 7 },
    4: { rajada: 9, blindagem: 21, folego: 22, quebra: 8 },
    5: { rajada: 10, blindagem: 24, folego: 25, quebra: 9 },
    6: { rajada: 11, blindagem: 26, folego: 27, quebra: 10 },
    7: { rajada: 12, blindagem: 29, folego: 30, quebra: 11 },
    8: { rajada: 13, blindagem: 31, folego: 32, quebra: 12 },
    9: { rajada: 14, blindagem: 34, folego: 35, quebra: 13 },
    10: { rajada: 15, blindagem: 37, folego: 38, quebra: 14 },
  },
  certeiro: {
    1: { rajada: 9, blindagem: 10, folego: 10, quebra: 8 },
    2: { rajada: 10, blindagem: 11, folego: 11, quebra: 9 },
    3: { rajada: 11, blindagem: 12, folego: 12, quebra: 10 },
    4: { rajada: 12, blindagem: 13, folego: 13, quebra: 11 },
    5: { rajada: 13, blindagem: 15, folego: 14, quebra: 12 },
    6: { rajada: 14, blindagem: 16, folego: 15, quebra: 13 },
    7: { rajada: 16, blindagem: 18, folego: 17, quebra: 15 },
    8: { rajada: 17, blindagem: 19, folego: 18, quebra: 16 },
    9: { rajada: 19, blindagem: 21, folego: 20, quebra: 18 },
    10: { rajada: 21, blindagem: 23, folego: 22, quebra: 20 },
  },
  motorista: {
    1: { rajada: 7, blindagem: 14, folego: 14, quebra: 7 },
    2: { rajada: 8, blindagem: 16, folego: 16, quebra: 8 },
    3: { rajada: 9, blindagem: 18, folego: 18, quebra: 9 },
    4: { rajada: 10, blindagem: 20, folego: 20, quebra: 10 },
    5: { rajada: 11, blindagem: 23, folego: 23, quebra: 11 },
    6: { rajada: 12, blindagem: 25, folego: 25, quebra: 12 },
    7: { rajada: 13, blindagem: 28, folego: 28, quebra: 13 },
    8: { rajada: 14, blindagem: 30, folego: 30, quebra: 14 },
    9: { rajada: 15, blindagem: 33, folego: 33, quebra: 15 },
    10: { rajada: 17, blindagem: 36, folego: 36, quebra: 17 },
  },
  nitro: {
    1: { rajada: 8, blindagem: 13, folego: 15, quebra: 8 },
    2: { rajada: 9, blindagem: 15, folego: 17, quebra: 9 },
    3: { rajada: 10, blindagem: 17, folego: 19, quebra: 10 },
    4: { rajada: 11, blindagem: 19, folego: 21, quebra: 11 },
    5: { rajada: 12, blindagem: 21, folego: 24, quebra: 12 },
    6: { rajada: 13, blindagem: 23, folego: 26, quebra: 13 },
    7: { rajada: 15, blindagem: 26, folego: 29, quebra: 15 },
    8: { rajada: 17, blindagem: 28, folego: 32, quebra: 17 },
    9: { rajada: 19, blindagem: 31, folego: 35, quebra: 19 },
    10: { rajada: 21, blindagem: 34, folego: 38, quebra: 21 },
  },
};

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toPositiveInt(value, fallback = 1) {
  const numeric = Math.floor(toNumber(value, fallback));
  return numeric > 0 ? numeric : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getBattleCapacity(barracoLevel) {
  return Math.max(100, toPositiveInt(barracoLevel, 1) * 100);
}

export function getGangAttackTimePerTileMs(barracoLevel, baseTime = 5000) {
  return Math.max(1, Math.floor(toNumber(baseTime, 5000))) / Math.max(1, toPositiveInt(barracoLevel, 1));
}

export function getRouteDistanceTiles(origin, target) {
  const dx = Math.abs(toPositiveInt(target.tileX, 0) - toPositiveInt(origin.tileX, 0));
  const dy = Math.abs(toPositiveInt(target.tileY, 0) - toPositiveInt(origin.tileY, 0));
  return Math.max(dx, dy);
}

export function buildTravelMetrics({ origin, target, barracoLevel }) {
  const routeDistanceTiles = getRouteDistanceTiles(origin, target);
  const timePerTileMs = getGangAttackTimePerTileMs(barracoLevel, 5000);
  const totalDurationMs = routeDistanceTiles * timePerTileMs;

  return {
    routeDistanceTiles,
    timePerTileMs,
    totalDurationMs,
  };
}

function createEmptyComposition() {
  return {
    capanga: 0,
    frente: 0,
    executor: 0,
    assassino: 0,
    muralha: 0,
    certeiro: 0,
    motorista: 0,
    nitro: 0,
  };
}

function recalculateGangStats(gangMembers = []) {
  const totalMembers = gangMembers.length;
  const activeMembers = gangMembers.filter((item) => item.status === 'ativo').length;
  const injuredMembers = gangMembers.filter((item) => item.status === 'ferido').length;
  const deadMembers = gangMembers.filter((item) => item.status === 'morto').length;
  const trainingMembers = gangMembers.filter((item) => item.status === 'treinando').length;

  const totalLevels = gangMembers.reduce((sum, item) => sum + toPositiveInt(item.level, 1), 0);
  const totalPower = gangMembers.reduce((sum, item) => sum + toPositiveInt(item.level, 1) * 10, 0);

  return {
    totalMembers,
    activeMembers,
    injuredMembers,
    deadMembers,
    trainingMembers,
    totalPower,
    averageLevel: totalMembers > 0 ? Number((totalLevels / totalMembers).toFixed(2)) : 0,
  };
}

function normalizeSelection(selection = {}) {
  const normalized = createEmptyComposition();
  for (const memberType of MEMBER_TYPES) {
    normalized[memberType] = Math.max(0, Math.floor(toNumber(selection?.[memberType], 0)));
  }
  return normalized;
}

function sortMembersForDeployment(a, b) {
  const recruitedCompare = String(a?.recruitedAt || '').localeCompare(String(b?.recruitedAt || ''));
  if (recruitedCompare !== 0) return recruitedCompare;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function getActiveMembers(player) {
  return Array.isArray(player?.gang?.members)
    ? player.gang.members.filter((member) => member.status === 'ativo').sort(sortMembersForDeployment)
    : [];
}

export function resolveSelectedMemberIdsForAttack({ attacker, selection, selectedMemberIds }) {
  const activeMembers = getActiveMembers(attacker);
  const capacity = getBattleCapacity(attacker?.niveis?.barracoLevel || 1);

  if (Array.isArray(selectedMemberIds) && selectedMemberIds.length > 0) {
    return activeMembers
      .filter((member) => selectedMemberIds.includes(String(member.id)))
      .slice(0, capacity)
      .map((member) => String(member.id));
  }

  const safeSelection = normalizeSelection(selection);
  const chosen = [];
  let used = 0;

  for (const memberType of MEMBER_TYPES) {
    const byType = activeMembers.filter((member) => member.type === memberType);
    const wanted = Math.max(0, Math.min(safeSelection[memberType], capacity - used));

    for (let index = 0; index < wanted; index += 1) {
      if (!byType[index]) break;
      chosen.push(String(byType[index].id));
      used += 1;
    }
  }

  return chosen;
}

function getAtributos(memberType, level) {
  const safeType = MEMBER_TYPES.includes(String(memberType)) ? String(memberType) : 'capanga';
  const safeLevel = Math.max(1, Math.min(10, toPositiveInt(level, 1)));
  return ATRIBUTOS_GANG[safeType][safeLevel];
}

function buildBattleUnits(side, members) {
  return members.map((member, index) => {
    const atributos = getAtributos(member.type, member.level);
    const folegoBase = Math.max(1, toPositiveInt(atributos.folego, 1));

    return {
      battleId: `${side}_${member.id}_${index}`,
      persistedId: String(member.id),
      side,
      type: String(member.type),
      level: Math.max(1, Math.min(10, toPositiveInt(member.level, 1))),
      rajada: Math.max(1, toPositiveInt(atributos.rajada, 1)),
      blindagem: Math.max(0, toPositiveInt(atributos.blindagem, 0)),
      quebra: Math.max(0, toPositiveInt(atributos.quebra, 0)),
      folegoBase,
      folegoAtual: folegoBase,
      recruitedAt: String(member.recruitedAt || ''),
      damageDealt: 0,
      damageTaken: 0,
    };
  });
}

function isAlive(unit) {
  return unit.folegoAtual > 0;
}

function compareTurnOrder(a, b) {
  const speedA = a.rajada + a.folegoAtual;
  const speedB = b.rajada + b.folegoAtual;
  if (speedB !== speedA) return speedB - speedA;
  if (b.quebra !== a.quebra) return b.quebra - a.quebra;
  if (b.blindagem !== a.blindagem) return b.blindagem - a.blindagem;
  return String(a.battleId).localeCompare(String(b.battleId));
}

function pickTarget(enemyUnits) {
  return enemyUnits.find(isAlive) || null;
}

function classifyStatus(unit) {
  if (unit.folegoAtual <= 0) return 'morto';
  if (unit.folegoAtual < unit.folegoBase) return 'ferido';
  return 'ativo';
}

function summarizeCompositionFromMembers(members) {
  const composition = createEmptyComposition();
  for (const member of members) {
    if (MEMBER_TYPES.includes(String(member.type))) {
      composition[member.type] += 1;
    }
  }
  return composition;
}

function summarizeFinalCompositionFromUnits(units) {
  const composition = createEmptyComposition();
  for (const unit of units) {
    if (isAlive(unit) && MEMBER_TYPES.includes(String(unit.type))) {
      composition[unit.type] += 1;
    }
  }
  return composition;
}

function countStatus(units, status) {
  return units.filter((unit) => classifyStatus(unit) === status).length;
}

function sumDamageDealt(units) {
  return units.reduce((sum, unit) => sum + unit.damageDealt, 0);
}

function sumDamageTaken(units) {
  return units.reduce((sum, unit) => sum + unit.damageTaken, 0);
}

function computeLoot({
  winner,
  attacker,
  defender,
  attackerDamageDone,
  defenderDamageDone,
  attackerInitialFolegoTotal,
  defenderInitialFolegoTotal,
}) {
  if (winner === 'empate') {
    return {
      lootDirtyMoney: 0,
      barracoLevelPerdedor: 0,
      nextDirtyMoneyAtacante: Math.max(0, toPositiveInt(attacker?.balances?.dirtyMoney, 0)),
      nextDirtyMoneyDefensor: Math.max(0, toPositiveInt(defender?.balances?.dirtyMoney, 0)),
    };
  }

  const loser = winner === 'atacante' ? defender : attacker;
  const winnerPlayer = winner === 'atacante' ? attacker : defender;
  const damageCausedToLoser = winner === 'atacante' ? attackerDamageDone : defenderDamageDone;
  const loserInitialFolegoTotal = winner === 'atacante' ? defenderInitialFolegoTotal : attackerInitialFolegoTotal;

  const espolioMaximo = 100 * Math.max(1, toPositiveInt(loser?.niveis?.barracoLevel, 1));
  const taxaDeDano = loserInitialFolegoTotal > 0 ? damageCausedToLoser / loserInitialFolegoTotal : 0;
  const espolioCalculado = Math.floor(espolioMaximo * Math.min(1, taxaDeDano));
  const lootDirtyMoney = Math.min(
    Math.max(0, espolioCalculado),
    Math.max(0, toPositiveInt(loser?.balances?.dirtyMoney, 0))
  );

  return {
    lootDirtyMoney,
    barracoLevelPerdedor: Math.max(1, toPositiveInt(loser?.niveis?.barracoLevel, 1)),
    nextDirtyMoneyAtacante:
      winner === 'atacante'
        ? Math.max(0, toPositiveInt(winnerPlayer?.balances?.dirtyMoney, 0) + lootDirtyMoney)
        : Math.max(0, toPositiveInt(attacker?.balances?.dirtyMoney, 0) - lootDirtyMoney),
    nextDirtyMoneyDefensor:
      winner === 'defensor'
        ? Math.max(0, toPositiveInt(winnerPlayer?.balances?.dirtyMoney, 0) + lootDirtyMoney)
        : Math.max(0, toPositiveInt(defender?.balances?.dirtyMoney, 0) - lootDirtyMoney),
  };
}

function updateGangMembersAfterBattle(originalMembers, unitsMap) {
  return originalMembers.map((member) => {
    const unit = unitsMap.get(String(member.id));
    if (!unit) {
      return { ...member };
    }

    return {
      ...member,
      status: classifyStatus(unit),
    };
  });
}

export function resolveAttackResult({
  attacker,
  defender,
  selectedMemberIds = [],
  selection = {},
}) {
  const attackerActiveMembers = getActiveMembers(attacker);
  const defenderActiveMembers = getActiveMembers(defender);

  const attackerCapacity = getBattleCapacity(attacker?.niveis?.barracoLevel || 1);
  const defenderCapacity = getBattleCapacity(defender?.niveis?.barracoLevel || 1);

  const resolvedSelectedMemberIds = resolveSelectedMemberIdsForAttack({
    attacker,
    selection,
    selectedMemberIds,
  });

  const attackerMembersInBattle = attackerActiveMembers
    .filter((member) => resolvedSelectedMemberIds.includes(String(member.id)))
    .slice(0, attackerCapacity);

  const defenderMembersInBattle = defenderActiveMembers.slice(0, defenderCapacity);

  const attackerUnits = buildBattleUnits('atacante', attackerMembersInBattle);
  const defenderUnits = buildBattleUnits('defensor', defenderMembersInBattle);

  const attackerInitialFolegoTotal = attackerUnits.reduce((sum, unit) => sum + unit.folegoBase, 0);
  const defenderInitialFolegoTotal = defenderUnits.reduce((sum, unit) => sum + unit.folegoBase, 0);

  let rounds = 0;
  const maxRounds = 10000;

  while (
    attackerUnits.some(isAlive) &&
    defenderUnits.some(isAlive) &&
    rounds < maxRounds
  ) {
    rounds += 1;

    const turnQueue = [...attackerUnits, ...defenderUnits]
      .filter(isAlive)
      .sort(compareTurnOrder);

    for (const actingUnit of turnQueue) {
      if (!isAlive(actingUnit)) continue;

      const enemyUnits = actingUnit.side === 'atacante' ? defenderUnits : attackerUnits;
      const target = pickTarget(enemyUnits);
      if (!target) break;

      const damage = Math.max(
        1,
        (actingUnit.rajada + actingUnit.quebra) - target.blindagem
      );

      target.folegoAtual = Math.max(0, target.folegoAtual - damage);
      actingUnit.damageDealt += damage;
      target.damageTaken += damage;
    }
  }

  const attackerAlive = attackerUnits.filter(isAlive).length;
  const defenderAlive = defenderUnits.filter(isAlive).length;
  const attackerRemainingFolego = attackerUnits.reduce((sum, unit) => sum + unit.folegoAtual, 0);
  const defenderRemainingFolego = defenderUnits.reduce((sum, unit) => sum + unit.folegoAtual, 0);
  const attackerDamageDone = sumDamageDealt(attackerUnits);
  const defenderDamageDone = sumDamageDealt(defenderUnits);

  let winner = 'empate';

  if (attackerAlive > 0 && defenderAlive <= 0) {
    winner = 'atacante';
  } else if (defenderAlive > 0 && attackerAlive <= 0) {
    winner = 'defensor';
  } else if (attackerAlive > defenderAlive) {
    winner = 'atacante';
  } else if (defenderAlive > attackerAlive) {
    winner = 'defensor';
  } else if (attackerRemainingFolego > defenderRemainingFolego) {
    winner = 'atacante';
  } else if (defenderRemainingFolego > attackerRemainingFolego) {
    winner = 'defensor';
  } else if (attackerDamageDone > defenderDamageDone) {
    winner = 'atacante';
  } else if (defenderDamageDone > attackerDamageDone) {
    winner = 'defensor';
  }

  const loot = computeLoot({
    winner,
    attacker,
    defender,
    attackerDamageDone,
    defenderDamageDone,
    attackerInitialFolegoTotal,
    defenderInitialFolegoTotal,
  });

  const attackerUnitsMap = new Map(attackerUnits.map((unit) => [unit.persistedId, unit]));
  const defenderUnitsMap = new Map(defenderUnits.map((unit) => [unit.persistedId, unit]));

  const nextAttackerMembers = updateGangMembersAfterBattle(
    Array.isArray(attacker?.gang?.members) ? clone(attacker.gang.members) : [],
    attackerUnitsMap
  );
  const nextDefenderMembers = updateGangMembersAfterBattle(
    Array.isArray(defender?.gang?.members) ? clone(defender.gang.members) : [],
    defenderUnitsMap
  );

  return {
    winner,
    rounds,
    lootDirtyMoney: loot.lootDirtyMoney,
    barracoLevelPerdedor: loot.barracoLevelPerdedor,
    nextDirtyMoneyAtacante: loot.nextDirtyMoneyAtacante,
    nextDirtyMoneyDefensor: loot.nextDirtyMoneyDefensor,
    attacker: {
      playerId: String(attacker?._id || attacker?.id || ''),
      name: String(attacker?.name || 'Atacante'),
      factionTag: attacker?.factionId || null,
      coordinates: {
        x: toNumber(attacker?.mapPosition?.tileX, 0),
        y: toNumber(attacker?.mapPosition?.tileY, 0),
      },
      barracoLevel: Math.max(1, toPositiveInt(attacker?.niveis?.barracoLevel, 1)),
      tropasEliminadas: countStatus(defenderUnits, 'morto'),
      perdas: countStatus(attackerUnits, 'morto'),
      machucados: countStatus(attackerUnits, 'ferido'),
      vivos: countStatus(attackerUnits, 'ativo'),
      danoTotalCausado: attackerDamageDone,
      danoTotalRecebido: sumDamageTaken(attackerUnits),
      composicaoInicial: summarizeCompositionFromMembers(attackerMembersInBattle),
      composicaoFinal: summarizeFinalCompositionFromUnits(attackerUnits),
    },
    defender: {
      playerId: String(defender?._id || defender?.id || ''),
      name: String(defender?.name || 'Defensor'),
      factionTag: defender?.factionId || null,
      coordinates: {
        x: toNumber(defender?.mapPosition?.tileX, 0),
        y: toNumber(defender?.mapPosition?.tileY, 0),
      },
      barracoLevel: Math.max(1, toPositiveInt(defender?.niveis?.barracoLevel, 1)),
      tropasEliminadas: countStatus(attackerUnits, 'morto'),
      perdas: countStatus(defenderUnits, 'morto'),
      machucados: countStatus(defenderUnits, 'ferido'),
      vivos: countStatus(defenderUnits, 'ativo'),
      danoTotalCausado: defenderDamageDone,
      danoTotalRecebido: sumDamageTaken(defenderUnits),
      composicaoInicial: summarizeCompositionFromMembers(defenderMembersInBattle),
      composicaoFinal: summarizeFinalCompositionFromUnits(defenderUnits),
    },
    nextAttackerGang: {
      members: nextAttackerMembers,
      stats: recalculateGangStats(nextAttackerMembers),
      updatedAtIso: new Date().toISOString(),
    },
    nextDefenderGang: {
      members: nextDefenderMembers,
      stats: recalculateGangStats(nextDefenderMembers),
      updatedAtIso: new Date().toISOString(),
