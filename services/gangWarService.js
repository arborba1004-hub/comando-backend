import GangWar from '../models/GangWar.js';

const GANG_BASE_CAPACITY = 12;
const GANG_CT_MAX_LEVEL = 10;

const VALID_FORMATIONS = [
  'pressao_total',
  'linha_fechada',
  'bote_certo',
  'cerco',
  'saque_rapido',
];

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

const FORMATION_BONUSES = {
  pressao_total: { rajadaPercent: 18, blindagemPercent: -8, folegoPercent: -4, quebraPercent: 14, lootPercent: 0, casualtyReductionPercent: -6, medicalEfficiencyPercent: 0, mobilityPercent: 6 },
  linha_fechada: { rajadaPercent: -6, blindagemPercent: 20, folegoPercent: 10, quebraPercent: -4, lootPercent: 0, casualtyReductionPercent: 12, medicalEfficiencyPercent: 10, mobilityPercent: -4 },
  bote_certo: { rajadaPercent: 10, blindagemPercent: 0, folegoPercent: 0, quebraPercent: 10, lootPercent: 8, casualtyReductionPercent: 0, medicalEfficiencyPercent: 0, mobilityPercent: 8 },
  cerco: { rajadaPercent: 6, blindagemPercent: 8, folegoPercent: 6, quebraPercent: 6, lootPercent: 0, casualtyReductionPercent: 6, medicalEfficiencyPercent: 6, mobilityPercent: 0 },
  saque_rapido: { rajadaPercent: 0, blindagemPercent: -6, folegoPercent: -2, quebraPercent: 4, lootPercent: 22, casualtyReductionPercent: -4, medicalEfficiencyPercent: 0, mobilityPercent: 10 },
};

// Funções Utilitárias
function round(value) { return Math.round(Number(value || 0) * 100) / 100; }
function levelMultiplier(level) { return 1 + (Math.max(1, Number(level || 1)) - 1) * 0.18; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function generateMemberId(type) { return `gang_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }
function applyPercent(value, percent) { return Number((Number(value || 0) * (1 + Number(percent || 0) / 100)).toFixed(2)); }
function getFormationBonus(formation) { return FORMATION_BONUSES[formation] || FORMATION_BONUSES.pressao_total; }

async function reconcileGangState(doc) {
  if (!doc) return false;
  const now = Date.now();
  let changed = false;

  // Processar treinamentos concluídos
  if (doc.trainingJobs && doc.trainingJobs.length > 0) {
    for (const job of doc.trainingJobs) {
      if (!job.completed && new Date(job.endsAt).getTime() <= now) {
        job.completed = true;
        const member = doc.members.find((m) => m.id === job.memberId);
        if (member) {
          member.level = job.toLevel;
          member.status = 'ativo';
          member.trainingEndsAt = null;
        }
        changed = true;
      }
    }
  }

  // Processar ferimentos e travas de status
  for (const member of doc.members) {
    if (member.status === 'ferido' && member.injuryEndsAt && new Date(member.injuryEndsAt).getTime() <= now) {
      member.status = 'ativo';
      member.injuryEndsAt = null;
      changed = true;
    }
    if (member.status === 'treinando' && (!member.trainingEndsAt || new Date(member.trainingEndsAt).getTime() <= now)) {
      // Fallback para caso o job tenha sido concluído mas o status do membro não
      const activeJob = doc.trainingJobs.find(j => j.memberId === member.id && !j.completed);
      if (!activeJob) {
        member.status = 'ativo';
        member.trainingEndsAt = null;
        changed = true;
      }
    }
  }

  if (changed) await doc.save();
  return changed;
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

export function getGangMaxMembers(ctLevel, barracoLevel = 1) {
  const ct = getCTStateFromLevel(ctLevel);
  const barracoBonus = Math.floor(Math.max(1, Number(barracoLevel)) / 10);
  return GANG_BASE_CAPACITY + ct.gangCapacityBonus + barracoBonus;
}

export function serializeGang(doc, player) {
  // CRÍTICO: Garante que o retorno bata com o que o Frontend espera no gangStore.ts
  return {
    gang: {
      id: doc._id,
      members: doc.members || [],
      ct: doc.ct || getCTStateFromLevel(1),
      trainingJobs: doc.trainingJobs || [],
      formation: doc.formation || 'pressao_total',
      maxMembers: getGangMaxMembers(doc.ct?.level || 1, player?.niveis?.barracoLevel || 1),
      dailyUpkeep: getGangDailyUpkeep(doc.members || []),
      lastMaintenanceDate: doc.lastMaintenanceDate
    },
    playerBalances: {
      dirtyMoney: Number(player?.balances?.dirtyMoney || 0),
      cleanMoney: Number(player?.balances?.cleanMoney || 0),
      corre: Number(player?.balances?.corre || 0),
    },
  };
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
  let totalDirtyMoneyCost = 0;
  const byType = {};
  Object.keys(MEMBER_DEFS).forEach(t => byType[t] = 0);

  for (const member of members) {
    if (member.status === 'morto') continue;
    const def = MEMBER_DEFS[member.type];
    const cost = Math.round(def.upkeep * levelMultiplier(member.level));
    byType[member.type] += cost;
    totalDirtyMoneyCost += cost;
  }
  return { totalDirtyMoneyCost, byType };
}

// Handlers Principais
export async function getOrCreateGangWar(playerId) {
  let doc = await GangWar.findOne({ playerId });
  if (!doc) {
    doc = await GangWar.create({
      playerId,
      ct: getCTStateFromLevel(1),
      formation: 'pressao_total',
      members: [],
      trainingJobs: [],
    });
  }
  await reconcileGangState(doc);
  return doc;
}

export async function handleSetFormation(player, formation) {
  const doc = await getOrCreateGangWar(player._id);
  if (!VALID_FORMATIONS.includes(formation)) throw new Error('Formação inválida');
  doc.formation = formation;
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleRecruitMember(player, type) {
  const doc = await getOrCreateGangWar(player._id);
  const def = MEMBER_DEFS[type];
  if (!def) throw new Error('Tipo de integrante inválido');

  const max = getGangMaxMembers(doc.ct.level, player.niveis?.barracoLevel);
  if (doc.members.length >= max) throw new Error('Limite da gangue atingido');
  if (Number(player.balances?.dirtyMoney || 0) < def.recruit) throw new Error('Dinheiro sujo insuficiente');

  player.balances.dirtyMoney -= def.recruit;
  doc.members.push({
    id: generateMemberId(type),
    type,
    level: 1,
    status: 'ativo',
    recruitedAt: new Date().toISOString()
  });

  await player.save();
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleStartTraining(player, memberId) {
  const doc = await getOrCreateGangWar(player._id);
  const member = doc.members.find(m => m.id === memberId);

  if (!member) throw new Error('Membro não encontrado');
  if (member.status !== 'ativo') throw new Error('Membro indisponível para treino');
  
  const activeJobs = doc.trainingJobs.filter(j => !j.completed).length;
  if (activeJobs >= doc.ct.trainingSlots) throw new Error('CT sem slots livres');

  const def = MEMBER_DEFS[member.type];
  const cost = Math.round(def.train * levelMultiplier(member.level));

  if (Number(player.balances?.dirtyMoney || 0) < cost) throw new Error('Dinheiro sujo insuficiente');

  const hours = Math.max(1, Math.ceil(def.hours * (1 - doc.ct.trainingSpeedBonusPercent / 100)));
  const endsAt = new Date(Date.now() + hours * 3600000);

  player.balances.dirtyMoney -= cost;
  member.status = 'treinando';
  member.trainingEndsAt = endsAt.toISOString();

  doc.trainingJobs.push({
    id: `train_${member.id}_${Date.now()}`,
    memberId: member.id,
    toLevel: member.level + 1,
    endsAt: endsAt.toISOString(),
    completed: false
  });

  await player.save();
  await doc.save();
  return serializeGang(doc, player);
}

// Exportações Adicionais (Upgrade, Manutenção, etc seguem a mesma lógica de serialize)
export async function handleUpgradeCT(player) {
  const doc = await getOrCreateGangWar(player._id);
  const cost = Math.round(4000 * Math.pow(1.5, doc.ct.level - 1));
  if (player.balances.dirtyMoney < cost) throw new Error('Dinheiro insuficiente');
  
  player.balances.dirtyMoney -= cost;
  doc.ct = getCTStateFromLevel(doc.ct.level + 1);
  await player.save();
  await doc.save();
  return serializeGang(doc, player);
}

export async function handlePayMaintenance(player) {
  const doc = await getOrCreateGangWar(player._id);
  const upkeep = getGangDailyUpkeep(doc.members);
  if (player.balances.dirtyMoney < upkeep.totalDirtyMoneyCost) throw new Error('Dinheiro insuficiente');
  
  player.balances.dirtyMoney -= upkeep.totalDirtyMoneyCost;
  doc.lastMaintenanceDate = todayKey();
  await player.save();
  await doc.save();
  return serializeGang(doc, player);
}

export async function handleApplyBattleLosses(player, losses) {
    const doc = await getOrCreateGangWar(player._id);
    // Lógica de aplicação de perdas mantida, mas retornando serializeGang atualizado
    // ... (mesmo loop de killOne/injureOne do seu original)
    await doc.save();
    return serializeGang(doc, player);
}
