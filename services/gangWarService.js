import GangWar from '../models/GangWar.js';

const GANG_BASE_CAPACITY = 12;
const GANG_CT_MAX_LEVEL = 10;

const MEMBER_DEFS = {
  capanga: { recruit: 1200, train: 700, upkeep: 180, hours: 2, casualtyWeight: 1.05, base: { rajada: 7, blindagem: 6, folego: 7, quebra: 6 }, special: {} },
  frente: { recruit: 1800, train: 950, upkeep: 240, hours: 3, casualtyWeight: 1.15, base: { rajada: 9, blindagem: 6, folego: 8, quebra: 7 }, special: {} },
  executor: { recruit: 2600, train: 1400, upkeep: 320, hours: 4, casualtyWeight: 1.1, base: { rajada: 9, blindagem: 6, folego: 7, quebra: 9 }, special: {} },
  assassino: { recruit: 3200, train: 1700, upkeep: 380, hours: 4, casualtyWeight: 1.25, base: { rajada: 10, blindagem: 4, folego: 6, quebra: 9 }, special: {} },
  muralha: { recruit: 3000, train: 1600, upkeep: 360, hours: 4, casualtyWeight: 0.8, base: { rajada: 4, blindagem: 10, folego: 10, quebra: 4 }, special: {} },
  certeiro: { recruit: 2800, train: 1500, upkeep: 330, hours: 4, casualtyWeight: 1.15, base: { rajada: 9, blindagem: 4, folego: 6, quebra: 7 }, special: {} },
  motorista: { recruit: 2300, train: 1300, upkeep: 290, hours: 3, casualtyWeight: 1.0, base: { rajada: 6, blindagem: 6, folego: 7, quebra: 7 }, special: { mobilityPower: 8 } },
  nitro: { recruit: 2500, train: 1350, upkeep: 300, hours: 3, casualtyWeight: 1.1, base: { rajada: 8, blindagem: 4, folego: 6, quebra: 6 }, special: { mobilityPower: 6 } },
  armeiro: { recruit: 2600, train: 1400, upkeep: 310, hours: 3, casualtyWeight: 1.0, base: { rajada: 6, blindagem: 5, folego: 6, quebra: 8 }, special: { weaponPower: 9 } },
  informante: { recruit: 2400, train: 1250, upkeep: 280, hours: 3, casualtyWeight: 1.2, base: { rajada: 5, blindagem: 4, folego: 6, quebra: 5 }, special: { intelPower: 10 } },
  wifi: { recruit: 2200, train: 1200, upkeep: 260, hours: 3, casualtyWeight: 1.15, base: { rajada: 3, blindagem: 4, folego: 6, quebra: 3 }, special: { coordinationPower: 10 } },
  medico: { recruit: 3400, train: 1800, upkeep: 400, hours: 4, casualtyWeight: 0.95, base: { rajada: 2, blindagem: 4, folego: 9, quebra: 2 }, special: { medicalPower: 12 } },
  lavador: { recruit: 2800, train: 1450, upkeep: 290, hours: 3, casualtyWeight: 1.05, base: { rajada: 2, blindagem: 4, folego: 7, quebra: 2 }, special: { economyPower: 10 } },
  ladrao: { recruit: 2100, train: 1150, upkeep: 240, hours: 3, casualtyWeight: 1.1, base: { rajada: 5, blindagem: 4, folego: 6, quebra: 5 }, special: { lootPower: 10 } },
  negociador: { recruit: 2600, train: 1350, upkeep: 280, hours: 3, casualtyWeight: 1.05, base: { rajada: 2, blindagem: 5, folego: 6, quebra: 2 }, special: { negotiationPower: 10 } },
};

function round(value) {
  return Math.round(value * 100) / 100;
}

function levelMultiplier(level) {
  return 1 + (Math.max(1, level) - 1) * 0.18;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function generateMemberId(type) {
  return `gang_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getCTStateFromLevel(level) {
  const safeLevel = Math.max(1, Math.min(GANG_CT_MAX_LEVEL, Number(level || 1)));
  return {
    level: safeLevel,
    maxLevel: GANG_CT_MAX_LEVEL,
    trainingSlots: 1 + Math.floor((safeLevel - 1) / 2),
    recoveryBonusPercent: (safeLevel - 1) * 4,
    trainingSpeedBonusPercent: (safeLevel - 1) * 5,
    gangCapacityBonus: (safeLevel - 1) * 4,
  };
}

export function getGangMaxMembers(ctLevel, barracoLevel = 1, factionBonus = 0) {
  const ct = getCTStateFromLevel(ctLevel);
  const barracoBonus = Math.floor(Math.max(1, barracoLevel) / 10);
  return GANG_BASE_CAPACITY + ct.gangCapacityBonus + barracoBonus + factionBonus;
}

export function getMemberBattleStats(member) {
  const def = MEMBER_DEFS[member.type];
  const mult = levelMultiplier(member.level);

  return {
    rajada: round(def.base.rajada * mult),
    blindagem: round(def.base.blindagem * mult),
    folego: round(def.base.folego * mult),
    quebra: round(def.base.quebra * mult),
  };
}

export function getGangDailyUpkeep(members) {
  const byType = {
    capanga: 0,
    frente: 0,
    executor: 0,
    assassino: 0,
    muralha: 0,
    certeiro: 0,
    motorista: 0,
    nitro: 0,
    armeiro: 0,
    informante: 0,
    wifi: 0,
    medico: 0,
    lavador: 0,
    ladrao: 0,
    negociador: 0,
  };

  let totalDirtyMoneyCost = 0;

  for (const member of members) {
    if (member.status === 'morto') continue;
    const def = MEMBER_DEFS[member.type];
    const cost = Math.round(def.upkeep * levelMultiplier(member.level));
    byType[member.type] += cost;
    totalDirtyMoneyCost += cost;
  }

  return { totalDirtyMoneyCost, byType };
}

export function buildGangBattleCompositionStats(members) {
  const activeMembers = members.filter((m) => m.status === 'ativo');
  const feridos = members.filter((m) => m.status === 'ferido').length;
  const mortos = members.filter((m) => m.status === 'morto').length;

  let rajada = 0;
  let blindagem = 0;
  let folego = 0;
  let quebra = 0;
  let medicalPower = 0;
  let economyPower = 0;
  let lootPower = 0;
  let intelPower = 0;
  let mobilityPower = 0;
  let weaponPower = 0;
  let coordinationPower = 0;
  let negotiationPower = 0;

  for (const member of activeMembers) {
    const stats = getMemberBattleStats(member);
    const def = MEMBER_DEFS[member.type];
    const mult = levelMultiplier(member.level);

    rajada += stats.rajada;
    blindagem += stats.blindagem;
    folego += stats.folego;
    quebra += stats.quebra;

    medicalPower += (def.special.medicalPower || 0) * mult;
    economyPower += (def.special.economyPower || 0) * mult;
    lootPower += (def.special.lootPower || 0) * mult;
    intelPower += (def.special.intelPower || 0) * mult;
    mobilityPower += (def.special.mobilityPower || 0) * mult;
    weaponPower += (def.special.weaponPower || 0) * mult;
    coordinationPower += (def.special.coordinationPower || 0) * mult;
    negotiationPower += (def.special.negotiationPower || 0) * mult;
  }

  const totalPower =
    rajada * 1.15 +
    blindagem * 1.05 +
    folego * 0.95 +
    quebra * 1.2 +
    intelPower * 0.35 +
    mobilityPower * 0.3 +
    weaponPower * 0.4 +
    coordinationPower * 0.25;

  return {
    totalMembers: members.length,
    ativos: activeMembers.length,
    feridos,
    mortos,
    rajada: round(rajada),
    blindagem: round(blindagem),
    folego: round(folego),
    quebra: round(quebra),
    medicalPower: round(medicalPower),
    economyPower: round(economyPower),
    lootPower: round(lootPower),
    intelPower: round(intelPower),
    mobilityPower: round(mobilityPower),
    weaponPower: round(weaponPower),
    coordinationPower: round(coordinationPower),
    negotiationPower: round(negotiationPower),
    totalPower: round(totalPower),
  };
}

function emptyLossRecord() {
  return {
    capanga: 0,
    frente: 0,
    executor: 0,
    assassino: 0,
    muralha: 0,
    certeiro: 0,
    motorista: 0,
    nitro: 0,
    armeiro: 0,
    informante: 0,
    wifi: 0,
    medico: 0,
    lavador: 0,
    ladrao: 0,
    negociador: 0,
  };
}

export function resolveGangCasualties({ members, ownStats, enemyStats, ctLevel, side }) {
  const ativos = members.filter((m) => m.status === 'ativo');
  const mortos = emptyLossRecord();
  const feridos = emptyLossRecord();

  if (!ativos.length) {
    return { mortos, feridos, preservadosPeloMedico: 0 };
  }

  const ct = getCTStateFromLevel(ctLevel);
  const enemyPressure = enemyStats.rajada * 1.05 + enemyStats.quebra * 1.1;
  const ownProtection = ownStats.blindagem * 0.9 + ownStats.folego * 0.85;

  const rawLossRate = clamp(
    (enemyPressure - ownProtection * 0.55) / Math.max(ownStats.totalPower, 1),
    0.04,
    0.65
  );

  const sideModifier = side === 'attacker' ? 1.08 : 0.94;
  const casualtyCount = Math.min(
    ativos.length,
    Math.max(1, Math.round(ativos.length * rawLossRate * sideModifier))
  );

  const sortedTargets = [...ativos].sort((a, b) => {
    return MEMBER_DEFS[b.type].casualtyWeight - MEMBER_DEFS[a.type].casualtyWeight;
  });

  const medicalSaveChance = clamp(
    0.18 + ownStats.medicalPower * 0.0025 + ct.recoveryBonusPercent * 0.003,
    0.18,
    0.9
  );

  let preservadosPeloMedico = 0;

  for (let i = 0; i < casualtyCount; i += 1) {
    const target = sortedTargets[i % sortedTargets.length];
    const saved = Math.random() < medicalSaveChance;

    if (saved) {
      feridos[target.type] += 1;
      preservadosPeloMedico += 1;
    } else {
      const deathChanceBase =
        0.52 -
        ownStats.folego * 0.0009 -
        ownStats.blindagem * 0.0007 -
        ownStats.medicalPower * 0.0012;

      const finalDeathChance = clamp(deathChanceBase, 0.12, 0.72);

      if (Math.random() < finalDeathChance) {
        mortos[target.type] += 1;
      } else {
        feridos[target.type] += 1;
      }
    }
  }
return { mortos, feridos, preservadosPeloMedico };
}

export async function getOrCreateGangWar(playerId) {
  let doc = await GangWar.findOne({ playerId });
  if (!doc) {
    doc = await GangWar.create({
      playerId,
      ct: getCTStateFromLevel(1),
      members: [],
      trainingJobs: [],
      lastMaintenanceDate: null,
    });
  }
  return doc;
}

export function serializeGang(doc, player) {
  const maxMembers = getGangMaxMembers(doc.ct.level, player?.niveis?.barracoLevel || 1, 0);

  return {
    gang: {
      members: doc.members,
      ct: doc.ct,
      trainingJobs: doc.trainingJobs,
      maxMembers,
      dailyUpkeep: getGangDailyUpkeep(doc.members),
    },
    playerBalances: {
      dirtyMoney: Number(player?.balances?.dirtyMoney || 0),
      cleanMoney: Number(player?.balances?.cleanMoney || 0),
      corre: Number(player?.balances?.corre || 0),
    },
  };
}

export async function recruitMemberForPlayer(player) {
  return serializeGang(await getOrCreateGangWar(player._id), player);
}

export async function handleRecruitMember(player, type) {
  const doc = await getOrCreateGangWar(player._id);
  const def = MEMBER_DEFS[type];

  if (!def) {
    throw new Error('Tipo de integrante inválido');
  }

  const maxMembers = getGangMaxMembers(doc.ct.level, player?.niveis?.barracoLevel || 1, 0);

  if (doc.members.length >= maxMembers) {
    throw new Error('Limite da gangue atingido');
  }

  if (Number(player.balances?.dirtyMoney || 0) < def.recruit) {
    throw new Error('Dinheiro sujo insuficiente');
  }

  player.balances.dirtyMoney -= def.recruit;

  doc.members.push({
    id: generateMemberId(type),
    type,
    level: 1,
    status: 'ativo',
    recruitedAt: new Date().toISOString(),
    trainingEndsAt: null,
    injuryEndsAt: null,
    lastBattleAt: null,
  });

  await player.save();
  await doc.save();

  return serializeGang(doc, player);
}

export async function handleStartTraining(player, memberId) {
  const doc = await getOrCreateGangWar(player._id);
  const member = doc.members.find((m) => m.id === memberId);

  if (!member) {
    throw new Error('Membro não encontrado');
  }

  if (member.status !== 'ativo') {
    throw new Error('Somente membros ativos podem treinar');
  }

  if (member.level >= 10) {
    throw new Error('Membro já está no nível máximo');
  }

  const activeTrainingJobs = doc.trainingJobs.filter((job) => !job.completed);
  if (activeTrainingJobs.length >= doc.ct.trainingSlots) {
    throw new Error('Todos os slots do CT estão ocupados');
  }

  const def = MEMBER_DEFS[member.type];
  const cost = Math.round(def.train * (1 + (member.level - 1) * 0.25));

  if (Number(player.balances?.dirtyMoney || 0) < cost) {
    throw new Error('Dinheiro sujo insuficiente');
  }

  const rawHours = def.hours * (1 + (member.level - 1) * 0.15);
  const reducedHours = rawHours * (1 - doc.ct.trainingSpeedBonusPercent / 100);
  const hours = Math.max(1, Math.ceil(reducedHours));
  const now = new Date();
  const endsAt = new Date(now.getTime() + hours * 60 * 60 * 1000);

  player.balances.dirtyMoney -= cost;

  member.status = 'treinando';
  member.trainingEndsAt = endsAt.toISOString();

  doc.trainingJobs.push({
    id: `gang_training_${member.id}_${Date.now()}`,
    memberId: member.id,
    memberType: member.type,
    fromLevel: member.level,
    toLevel: Math.min(10, member.level + 1),
    costDirtyMoney: cost,
    startedAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    completed: false,
  });

  await player.save();
  await doc.save();

  return serializeGang(doc, player);
}

export async function handleCompleteTraining(player) {
  const doc = await getOrCreateGangWar(player._id);
  const now = Date.now();

  for (const job of doc.trainingJobs) {
    if (!job.completed && new Date(job.endsAt).getTime() <= now) {
      job.completed = true;

      const member = doc.members.find((m) => m.id === job.memberId);
      if (member) {
        member.level = job.toLevel;
        member.status = 'ativo';
        member.trainingEndsAt = null;
      }
    }
  }

  await doc.save();
  return serializeGang(doc, player);
}

export async function handleUpgradeCT(player) {
  const doc = await getOrCreateGangWar(player._id);

  if (doc.ct.level >= doc.ct.maxLevel) {
    throw new Error('CT já está no nível máximo');
  }

  const upgradeCost = Math.round(4000 * Math.pow(1.35, doc.ct.level - 1));

  if (Number(player.balances?.dirtyMoney || 0) < upgradeCost) {
    throw new Error('Dinheiro sujo insuficiente');
  }

  player.balances.dirtyMoney -= upgradeCost;
  doc.ct = getCTStateFromLevel(doc.ct.level + 1);

  await player.save();
  await doc.save();

  return serializeGang(doc, player);
}

export async function handlePayMaintenance(player) {
  const doc = await getOrCreateGangWar(player._id);
  const today = todayKey();

  if (doc.lastMaintenanceDate === today) {
    throw new Error('Manutenção de hoje já foi paga');
  }

  const upkeep = getGangDailyUpkeep(doc.members);

  if (Number(player.balances?.dirtyMoney || 0) < upkeep.totalDirtyMoneyCost) {
    throw new Error('Dinheiro sujo insuficiente');
  }

  player.balances.dirtyMoney -= upkeep.totalDirtyMoneyCost;
  doc.lastMaintenanceDate = today;

  await player.save();
  await doc.save();

  return serializeGang(doc, player);
}

export async function handleApplyBattleLosses(player, losses) {
  const doc = await getOrCreateGangWar(player._id);
  const nowIso = new Date().toISOString();

  function killOne(type) {
    const member = doc.members.find((m) => m.type === type && m.status === 'ativo');
    if (!member) return;
    member.status = 'morto';
    member.trainingEndsAt = null;
    member.injuryEndsAt = null;
    member.lastBattleAt = nowIso;
  }

  function injureOne(type) {
    const member = doc.members.find((m) => m.type === type && m.status === 'ativo');
    if (!member) return;

    const recoveryHours = Math.max(
      2,
      8 + member.level * 2 - Math.floor(doc.ct.recoveryBonusPercent / 10)
    );

    member.status = 'ferido';
    member.injuryEndsAt = new Date(Date.now() + recoveryHours * 60 * 60 * 1000).toISOString();
    member.lastBattleAt = nowIso;
  }

  for (const [type, qty] of Object.entries(losses.mortos || {})) {
    for (let i = 0; i < Number(qty || 0); i += 1) {
      killOne(type);
    }
  }

  for (const [type, qty] of Object.entries(losses.feridos || {})) {
    for (let i = 0; i < Number(qty || 0); i += 1) {
      injureOne(type);
    }
  }

  await doc.save();
  return serializeGang(doc, player);
}
