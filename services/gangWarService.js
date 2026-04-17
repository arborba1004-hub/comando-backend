import GangWar from '../models/GangWar.js';
import { generateId } from '../utils/gameHelpers.js';

export const VALID_FORMATIONS = [
  'pressao_total',
  'linha_fechada',
  'bote_certo',
  'cerco',
  'saque_rapido',
];

export const VALID_MEMBER_TYPES = [
  'capanga',
  'frente',
  'executor',
  'muralha',
  'certeiro',
  'motorista',
  'nitro',
  'armeiro',
  'informante',
  'wifi',
  'medico',
  'lavador',
  'negociador',
];

const MEMBER_DEFS = {
  capanga: { label: 'Capanga', recruit: 400, train: 250, upkeep: 35, role: 'frente', power: { rajada: 7, blindagem: 6, folego: 7, quebra: 6 }, battlePriority: 35, casualtyWeight: 1.0 },
  frente: { label: 'Frente', recruit: 550, train: 300, upkeep: 45, role: 'frente', power: { rajada: 9, blindagem: 6, folego: 8, quebra: 7 }, battlePriority: 30, casualtyWeight: 1.08 },
  executor: { label: 'Executor', recruit: 750, train: 420, upkeep: 60, role: 'frente', power: { rajada: 10, blindagem: 6, folego: 7, quebra: 9 }, battlePriority: 22, casualtyWeight: 1.05 },
  muralha: { label: 'Muralha', recruit: 700, train: 390, upkeep: 58, role: 'tanque', power: { rajada: 4, blindagem: 11, folego: 12, quebra: 4 }, battlePriority: 8, casualtyWeight: 0.72 },
  certeiro: { label: 'Certeiro', recruit: 680, train: 370, upkeep: 52, role: 'retaguarda', power: { rajada: 10, blindagem: 4, folego: 6, quebra: 7 }, battlePriority: 26, casualtyWeight: 1.14 },
  motorista: { label: 'Motorista', recruit: 520, train: 290, upkeep: 42, role: 'mobilidade', power: { rajada: 6, blindagem: 6, folego: 7, quebra: 6 }, battlePriority: 18, casualtyWeight: 0.92, special: { mobilityPower: 8 } },
  nitro: { label: 'Nitro', recruit: 610, train: 340, upkeep: 48, role: 'bonde', power: { rajada: 8, blindagem: 4, folego: 6, quebra: 6 }, battlePriority: 28, casualtyWeight: 1.02, special: { mobilityPower: 6 } },
  armeiro: { label: 'Armeiro', recruit: 620, train: 360, upkeep: 50, role: 'suporte', power: { rajada: 5, blindagem: 5, folego: 6, quebra: 8 }, battlePriority: 12, casualtyWeight: 0.9, special: { weaponPower: 12 } },
  informante: { label: 'Informante', recruit: 580, train: 330, upkeep: 46, role: 'suporte', power: { rajada: 4, blindagem: 4, folego: 6, quebra: 5 }, battlePriority: 10, casualtyWeight: 0.96, special: { intelPower: 14 } },
  wifi: { label: 'Wifi', recruit: 560, train: 320, upkeep: 44, role: 'coord', power: { rajada: 3, blindagem: 4, folego: 6, quebra: 3 }, battlePriority: 16, casualtyWeight: 1.0, special: { coordinationPower: 15 } },
  medico: { label: 'Médico', recruit: 800, train: 450, upkeep: 62, role: 'suporte', power: { rajada: 2, blindagem: 4, folego: 9, quebra: 2 }, battlePriority: 6, casualtyWeight: 0.75, special: { medicalPower: 18 } },
  lavador: { label: 'Lavador', recruit: 650, train: 350, upkeep: 49, role: 'economia', power: { rajada: 2, blindagem: 4, folego: 7, quebra: 2 }, battlePriority: 5, casualtyWeight: 0.82, special: { economyPower: 15, lootPower: 10 } },
  negociador: { label: 'Negociador', recruit: 700, train: 380, upkeep: 50, role: 'economia', power: { rajada: 2, blindagem: 5, folego: 8, quebra: 2 }, battlePriority: 4, casualtyWeight: 0.8, special: { negotiationPower: 16 } },
};

function getGangLevel(player) {
  const barracoLevel = Math.max(1, Number(player?.niveis?.barracoLevel || 1));
  return Math.floor(barracoLevel / 10) + 1;
}

function getTrainingQuantityPerOrder(player) {
  return getGangLevel(player) * 10;
}

function getTrainingDurationSeconds(player, ctLevel = 1) {
  const base = getGangLevel(player) * 10;
  const speedMultiplier = Math.max(0.4, 1 - ((ctLevel - 1) * 0.05));
  return Math.max(5, Math.round(base * speedMultiplier));
}

function getGangCapacity(player, ctLevel = 1) {
  return 200 + getGangLevel(player) * 120 + (ctLevel - 1) * 40;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureType(type) {
  if (!VALID_MEMBER_TYPES.includes(type)) {
    throw new Error('Tipo de integrante inválido');
  }
}

function getCTStateFromLevel(level) {
  const normalized = Math.max(1, Math.min(10, Number(level || 1)));
  return {
    level: normalized,
    maxLevel: 10,
    trainingSlots: 7,
    recoveryBonusPercent: (normalized - 1) * 5,
    trainingSpeedBonusPercent: (normalized - 1) * 5,
    gangCapacityBonus: (normalized - 1) * 40,
  };
}

function getEmptyLosses() {
  return {
    mortos: Object.fromEntries(VALID_MEMBER_TYPES.map((type) => [type, 0])),
    feridos: Object.fromEntries(VALID_MEMBER_TYPES.map((type) => [type, 0])),
    preservadosPeloMedico: 0,
  };
}

function applyPassiveGangMaintenance(doc) {
  const now = Date.now();
  let changed = false;

  for (const member of doc.members) {
    if (member.status === 'ferido' && member.injuryEndsAt && new Date(member.injuryEndsAt).getTime() <= now) {
      member.status = 'ativo';
      member.injuryEndsAt = null;
      changed = true;
    }
  }

  for (const job of doc.trainingJobs) {
    if (!job.completed && new Date(job.endsAt).getTime() <= now) {
      job.completed = true;
      for (const memberId of job.memberIds || []) {
        const member = doc.members.find((m) => m.id === memberId);
        if (member && member.status === 'treinando') {
          member.status = 'ativo';
          member.trainingEndsAt = null;
          member.level = Math.max(member.level || 1, job.toLevel || 1);
        }
      }
      changed = true;
    }
  }

  if (changed) {
    doc.markModified('members');
    doc.markModified('trainingJobs');
  }

  return changed;
}

export async function getOrCreateGangWar(playerId) {
  let doc = await GangWar.findOne({ playerId });
  if (!doc) {
    doc = await GangWar.create({
      playerId,
      ct: getCTStateFromLevel(1),
      members: [],
      trainingJobs: [],
      formation: 'pressao_total',
      version: 3,
    });
  }

  const changed = applyPassiveGangMaintenance(doc);
  if (changed) {
    await doc.save();
  }

  return doc;
}

function countByType(members, predicate = () => true) {
  const result = Object.fromEntries(VALID_MEMBER_TYPES.map((type) => [type, 0]));
  for (const member of members || []) {
    if (!VALID_MEMBER_TYPES.includes(member.type)) continue;
    if (predicate(member)) result[member.type] += 1;
  }
  return result;
}

function countActiveMembers(members) {
  return countByType(members, (m) => m.status === 'ativo');
}

function selectMembersForTroops(members, selectedTroops = []) {
  const activeByType = {};
  for (const type of VALID_MEMBER_TYPES) {
    activeByType[type] = (members || [])
      .filter((m) => m.type === type && m.status === 'ativo')
      .sort((a, b) => (b.level || 1) - (a.level || 1));
  }

  const picked = [];
  const normalizedTroops = [];

  for (const troop of selectedTroops || []) {
    const type = String(troop?.type || '');
    if (!VALID_MEMBER_TYPES.includes(type)) continue;

    const qtyRequested = Math.max(0, Number(troop?.quantity || 0));
    if (!qtyRequested) continue;

    const available = activeByType[type] || [];
    const take = available.splice(0, qtyRequested);
    if (!take.length) continue;

    picked.push(...take);
    normalizedTroops.push({ type, quantity: take.length });
  }

  return { picked, selectedTroops: normalizedTroops };
}

export function buildGangBattleStatsWithFormation(members, formation = 'pressao_total') {
  const alive = (members || []).filter((m) => m.status === 'ativo');
  const stats = {
    totalMembers: members?.filter((m) => m.status !== 'morto').length || 0,
    ativos: alive.length,
    feridos: members?.filter((m) => m.status === 'ferido').length || 0,
    mortos: members?.filter((m) => m.status === 'morto').length || 0,
    bondeAtivos: 0,
    rajada: 0,
    blindagem: 0,
    folego: 0,
    quebra: 0,
    medicalPower: 0,
    economyPower: 0,
    lootPower: 0,
    intelPower: 0,
    mobilityPower: 0,
    weaponPower: 0,
    coordinationPower: 0,
    negotiationPower: 0,
    totalPower: 0,
  };

  for (const member of alive) {
    const def = MEMBER_DEFS[member.type];
    if (!def) continue;
    const level = Math.max(1, Number(member.level || 1));
    const multiplier = 1 + (level - 1) * 0.14;

    stats.rajada += def.power.rajada * multiplier;
    stats.blindagem += def.power.blindagem * multiplier;
    stats.folego += def.power.folego * multiplier;
    stats.quebra += def.power.quebra * multiplier;

    if (member.type === 'nitro' || member.type === 'capanga') {
      stats.bondeAtivos += 1;
    }

    if (def.special?.medicalPower) stats.medicalPower += def.special.medicalPower * multiplier;
    if (def.special?.economyPower) stats.economyPower += def.special.economyPower * multiplier;
    if (def.special?.lootPower) stats.lootPower += def.special.lootPower * multiplier;
    if (def.special?.intelPower) stats.intelPower += def.special.intelPower * multiplier;
    if (def.special?.mobilityPower) stats.mobilityPower += def.special.mobilityPower * multiplier;
    if (def.special?.weaponPower) stats.weaponPower += def.special.weaponPower * multiplier;
    if (def.special?.coordinationPower) stats.coordinationPower += def.special.coordinationPower * multiplier;
    if (def.special?.negotiationPower) stats.negotiationPower += def.special.negotiationPower * multiplier;
  }

  const formationBuffs = {
    pressao_total: { atk: 1.12, def: 0.95, loot: 1.06 },
    linha_fechada: { atk: 0.95, def: 1.14, loot: 0.97 },
    bote_certo: { atk: 1.05, def: 1.05, loot: 1.0 },
    cerco: { atk: 1.02, def: 1.08, loot: 1.02 },
    saque_rapido: { atk: 0.98, def: 0.92, loot: 1.18 },
  }[formation] || { atk: 1, def: 1, loot: 1 };

  stats.rajada *= formationBuffs.atk;
  stats.quebra *= formationBuffs.atk;
  stats.blindagem *= formationBuffs.def;
  stats.folego *= formationBuffs.def;
  stats.lootPower *= formationBuffs.loot;

  stats.totalPower = Math.round(
    stats.rajada * 1.35 +
    stats.blindagem * 1.1 +
    stats.folego * 1.05 +
    stats.quebra * 1.2 +
    stats.bondeAtivos * 8 +
    stats.medicalPower * 0.75 +
    stats.lootPower * 0.6 +
    stats.intelPower * 0.65 +
    stats.mobilityPower * 0.7 +
    stats.weaponPower * 0.8 +
    stats.coordinationPower * 0.75 +
    stats.negotiationPower * 0.35
  );

  return Object.fromEntries(
    Object.entries(stats).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value) : value])
  );
}

export function resolveGangCasualties({
  members,
  ownStats,
  enemyStats,
  side = 'attacker',
}) {
  const losses = getEmptyLosses();
  const active = (members || []).filter((m) => m.status === 'ativo');
  if (!active.length) return losses;

  const incomingPressure = Math.max(0.05, (enemyStats?.totalPower || 0) / Math.max(1, ownStats?.totalPower || 1));
  const baseLossPercent = Math.min(0.45, 0.08 + incomingPressure * 0.14);
  const totalCasualties = Math.min(active.length, Math.max(0, Math.round(active.length * baseLossPercent)));

  const preserved = Math.min(
    totalCasualties,
    Math.round(((ownStats?.medicalPower || 0) / 60) + ((side === 'defender' ? ownStats?.blindagem || 0 : 0) / 160))
  );

  const effectiveCasualties = Math.max(0, totalCasualties - preserved);
  losses.preservadosPeloMedico = preserved;

  const sorted = [...active].sort((a, b) => {
    const aDef = MEMBER_DEFS[a.type];
    const bDef = MEMBER_DEFS[b.type];
    return (bDef?.battlePriority || 0) - (aDef?.battlePriority || 0);
  });

  for (let i = 0; i < effectiveCasualties; i += 1) {
    const member = sorted[i];
    if (!member) continue;
    const def = MEMBER_DEFS[member.type];
    const deathChance = Math.max(0.08, Math.min(0.62, 0.18 * (def?.casualtyWeight || 1)));
    const dead = Math.random() < deathChance;
    if (dead) losses.mortos[member.type] += 1;
    else losses.feridos[member.type] += 1;
  }

  return losses;
}

function applyLossesToDoc(doc, losses) {
  const now = Date.now();
  const recoveryHours = Math.max(2, 8 - Math.floor((doc?.ct?.recoveryBonusPercent || 0) / 10));

  for (const type of VALID_MEMBER_TYPES) {
    let toKill = Number(losses?.mortos?.[type] || 0);
    let toInjure = Number(losses?.feridos?.[type] || 0);

    for (const member of doc.members) {
      if (member.type !== type || member.status !== 'ativo') continue;
      if (toKill > 0) {
        member.status = 'morto';
        member.lastBattleAt = new Date(now);
        member.trainingEndsAt = null;
        member.injuryEndsAt = null;
        toKill -= 1;
        continue;
      }
      if (toInjure > 0) {
        member.status = 'ferido';
        member.lastBattleAt = new Date(now);
        member.trainingEndsAt = null;
        member.injuryEndsAt = new Date(now + recoveryHours * 60 * 60 * 1000);
        toInjure -= 1;
      }
      if (toKill <= 0 && toInjure <= 0) break;
    }
  }
}

function buildTrainingSummary(doc) {
  return (doc.trainingJobs || [])
    .filter((job) => !job.completed)
    .map((job) => ({
      id: job.id,
      batchId: job.batchId,
      memberType: job.memberType,
      quantity: job.quantity,
      fromLevel: job.fromLevel,
      toLevel: job.toLevel,
      costDirtyMoney: job.costDirtyMoney,
      startedAt: new Date(job.startedAt).toISOString(),
      endsAt: new Date(job.endsAt).toISOString(),
      completed: false,
    }));
}

export function serializeGang(doc, player) {
  const gangLevel = getGangLevel(player);
  const ctState = getCTStateFromLevel(doc?.ct?.level || 1);
  const byType = countByType(doc.members || [], (m) => m.status !== 'morto');
  const activeByType = countByType(doc.members || [], (m) => m.status === 'ativo');

  return {
    gang: {
      members: (doc.members || []).map((member) => ({
        id: member.id,
        type: member.type,
        level: member.level,
        status: member.status,
        recruitedAt: new Date(member.recruitedAt).toISOString(),
        trainingEndsAt: member.trainingEndsAt ? new Date(member.trainingEndsAt).toISOString() : null,
        injuryEndsAt: member.injuryEndsAt ? new Date(member.injuryEndsAt).toISOString() : null,
        lastBattleAt: member.lastBattleAt ? new Date(member.lastBattleAt).toISOString() : null,
      })),
      ct: ctState,
      trainingJobs: buildTrainingSummary(doc),
      formation: doc.formation || 'pressao_total',
      maxMembers: getGangCapacity(player, ctState.level),
      dailyUpkeep: {
        totalDirtyMoneyCost: (doc.members || [])
          .filter((m) => m.status !== 'morto')
          .reduce((sum, m) => sum + (MEMBER_DEFS[m.type]?.upkeep || 0), 0),
        byType: Object.fromEntries(
          VALID_MEMBER_TYPES.map((type) => [
            type,
            (doc.members || [])
              .filter((m) => m.type === type && m.status !== 'morto')
              .reduce((sum, m) => sum + (MEMBER_DEFS[type]?.upkeep || 0), 0),
          ])
        ),
      },
      trainingConfig: {
        quantityPerOrder: getTrainingQuantityPerOrder(player),
        durationSeconds: getTrainingDurationSeconds(player, ctState.level),
        slots: ctState.trainingSlots,
      },
      troopSummary: {
        totalMembers: (doc.members || []).filter((m) => m.status !== 'morto').length,
        activeMembers: (doc.members || []).filter((m) => m.status === 'ativo').length,
        injuredMembers: (doc.members || []).filter((m) => m.status === 'ferido').length,
        deadMembers: (doc.members || []).filter((m) => m.status === 'morto').length,
        trainingMembers: (doc.members || []).filter((m) => m.status === 'treinando').length,
        byType,
        activeByType,
      },
      gangLevel,
    },
    playerBalances: {
      dirtyMoney: Number(player?.balances?.dirtyMoney || 0),
      cleanMoney: Number(player?.balances?.cleanMoney || 0),
      corre: Number(player?.balances?.corre || 0),
    },
  };
}

export async function handleRecruitMember(player, type) {
  ensureType(type);
  const doc = await getOrCreateGangWar(player._id);
  if (doc.members.filter((m) => m.status !== 'morto').length >= getGangCapacity(player, doc.ct?.level || 1)) {
    throw new Error('Capacidade máxima da gangue atingida');
  }

  const cost = MEMBER_DEFS[type].recruit;
  if (Number(player?.balances?.dirtyMoney || 0) < cost) {
    throw new Error('Dinheiro sujo insuficiente');
  }

  player.balances.dirtyMoney -= cost;
  doc.members.push({
    id: generateId(),
    type,
    level: 1,
    status: 'ativo',
    recruitedAt: new Date(),
  });

  await player.save();
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleQueueTraining(player, type, quantityInput) {
  ensureType(type);
  const doc = await getOrCreateGangWar(player._id);
  const activeBatches = (doc.trainingJobs || []).filter((job) => !job.completed).length;
  if (activeBatches >= (doc.ct?.trainingSlots || 7)) {
    throw new Error('Todos os slots de treino estão ocupados');
  }

  const quantityPerOrder = getTrainingQuantityPerOrder(player);
  const quantity = Math.max(1, Math.min(quantityPerOrder, Number(quantityInput || quantityPerOrder)));
  const capacityLeft = getGangCapacity(player, doc.ct?.level || 1) - doc.members.filter((m) => m.status !== 'morto').length;
  if (capacityLeft <= 0) {
    throw new Error('Capacidade máxima da gangue atingida');
  }

  const finalQuantity = Math.min(quantity, capacityLeft);
  const def = MEMBER_DEFS[type];
  const cost = def.train * finalQuantity;
  if (Number(player?.balances?.dirtyMoney || 0) < cost) {
    throw new Error('Dinheiro sujo insuficiente para treinar');
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + getTrainingDurationSeconds(player, doc.ct?.level || 1) * 1000);
  const batchId = generateId();
  const memberIds = [];

  for (let i = 0; i < finalQuantity; i += 1) {
    const id = generateId();
    memberIds.push(id);
    doc.members.push({
      id,
      type,
      level: 1,
      status: 'treinando',
      recruitedAt: startedAt,
      trainingEndsAt: endsAt,
    });
  }

  doc.trainingJobs.push({
    id: generateId(),
    batchId,
    memberIds,
    memberType: type,
    quantity: finalQuantity,
    fromLevel: 0,
    toLevel: 1,
    costDirtyMoney: cost,
    startedAt,
    endsAt,
    completed: false,
  });

  player.balances.dirtyMoney -= cost;

  await player.save();
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleStartTraining(player, memberId) {
  const doc = await getOrCreateGangWar(player._id);
  const member = doc.members.find((m) => m.id === memberId);
  if (!member) throw new Error('Membro não encontrado');
  if (member.status !== 'ativo') throw new Error('Somente membros ativos podem treinar');
  if (member.level >= 10) throw new Error('Membro já está no nível máximo');

  const activeBatches = (doc.trainingJobs || []).filter((job) => !job.completed).length;
  if (activeBatches >= (doc.ct?.trainingSlots || 7)) {
    throw new Error('Todos os slots de treino estão ocupados');
  }

  const def = MEMBER_DEFS[member.type];
  const cost = Math.round(def.train * (1 + member.level * 0.3));
  if (Number(player?.balances?.dirtyMoney || 0) < cost) {
    throw new Error('Dinheiro sujo insuficiente');
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + getTrainingDurationSeconds(player, doc.ct?.level || 1) * 1000);

  member.status = 'treinando';
  member.trainingEndsAt = endsAt;

  doc.trainingJobs.push({
    id: generateId(),
    batchId: generateId(),
    memberIds: [member.id],
    memberType: member.type,
    quantity: 1,
    fromLevel: member.level,
    toLevel: member.level + 1,
    costDirtyMoney: cost,
    startedAt,
    endsAt,
    completed: false,
  });

  player.balances.dirtyMoney -= cost;
  await player.save();
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleCompleteTraining(player) {
  const doc = await getOrCreateGangWar(player._id);
  applyPassiveGangMaintenance(doc);
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleSetFormation(player, formation) {
  if (!VALID_FORMATIONS.includes(formation)) throw new Error('Formação inválida');
  const doc = await getOrCreateGangWar(player._id);
  doc.formation = formation;
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleUpgradeCT(player) {
  const doc = await getOrCreateGangWar(player._id);
  const currentLevel = Number(doc?.ct?.level || 1);
  if (currentLevel >= 10) throw new Error('CT já está no nível máximo');

  const cost = Math.round(5000 * Math.pow(1.35, currentLevel - 1));
  if (Number(player?.balances?.dirtyMoney || 0) < cost) {
    throw new Error('Dinheiro sujo insuficiente');
  }

  player.balances.dirtyMoney -= cost;
  doc.ct = getCTStateFromLevel(currentLevel + 1);
  await player.save();
  await doc.save();

  return serializeGang(doc, player);
}

export async function handlePayMaintenance(player) {
  const doc = await getOrCreateGangWar(player._id);
  const totalDirtyMoneyCost = (doc.members || [])
    .filter((m) => m.status !== 'morto')
    .reduce((sum, m) => sum + (MEMBER_DEFS[m.type]?.upkeep || 0), 0);

  if (Number(player?.balances?.dirtyMoney || 0) < totalDirtyMoneyCost) {
    throw new Error('Dinheiro sujo insuficiente');
  }

  player.balances.dirtyMoney -= totalDirtyMoneyCost;
  doc.lastMaintenanceDate = new Date();
  await player.save();
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleApplyBattleLosses(player, losses) {
  const doc = await getOrCreateGangWar(player._id);
  applyLossesToDoc(doc, losses || getEmptyLosses());
  await doc.save();
  return serializeGang(doc, player);
}

export async function getGangCombatContext(player, opts = {}) {
  const doc = await getOrCreateGangWar(player._id);
  const allMembers = (doc.members || []).map((member) => ({
    id: member.id,
    type: member.type,
    level: Number(member.level || 1),
    status: member.status,
    recruitedAt: new Date(member.recruitedAt).toISOString(),
    trainingEndsAt: member.trainingEndsAt ? new Date(member.trainingEndsAt).toISOString() : null,
    injuryEndsAt: member.injuryEndsAt ? new Date(member.injuryEndsAt).toISOString() : null,
    lastBattleAt: member.lastBattleAt ? new Date(member.lastBattleAt).toISOString() : null,
  }));

  const selectedMembers = Array.isArray(opts.selectedMemberIds) && opts.selectedMemberIds.length
    ? allMembers.filter((m) => opts.selectedMemberIds.includes(m.id) && m.status === 'ativo')
    : null;

  const troopSelection = !selectedMembers && Array.isArray(opts.selectedTroops) && opts.selectedTroops.length
    ? selectMembersForTroops(allMembers, opts.selectedTroops)
    : null;

  const marchMembers = selectedMembers || troopSelection?.picked || allMembers.filter((m) => m.status === 'ativo');
  const selectedTroops = troopSelection?.selectedTroops || (opts.selectedTroops || []);

  return {
    doc,
    allMembers,
    marchMembers,
    selectedTroops,
    formation: doc.formation || 'pressao_total',
    ctLevel: Number(doc?.ct?.level || 1),
    stats: buildGangBattleStatsWithFormation(marchMembers, doc.formation || 'pressao_total'),
    rosterStats: buildGangBattleStatsWithFormation(allMembers.filter((m) => m.status === 'ativo'), doc.formation || 'pressao_total'),
    availableByType: countActiveMembers(allMembers),
  };
}

export async function applyBattleLossesToPlayerGang(playerId, losses) {
  const doc = await getOrCreateGangWar(playerId);
  applyLossesToDoc(doc, losses || getEmptyLosses());
  await doc.save();
  return doc;
}
