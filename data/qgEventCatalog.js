// data/qgEventCatalog.js
// Tomada do QG — evento análogo à Prefeitura/Major War, adaptado ao mapa real do Commandia.
// Usa apenas prédios existentes: QG central + 4 CTs fixos do mapa.

export const QG_EVENT = {
  slug: 'tomada_qg',
  title: 'Tomada do QG',
  subtitle: 'O Complexo inteiro disputa o prédio central e os CTs de cerco.',
  timezone: 'America/Sao_Paulo',
  intervalMs: 72 * 60 * 60 * 1000,
  startHourLocal: 18,
  startMinuteLocal: 0,
  warningMs: 30 * 60 * 1000,
  requiredHoldMs: 0,
  maxBattleMs: 6 * 60 * 60 * 1000,
  appointmentMs: 2 * 60 * 60 * 1000,
  mandateMs: 72 * 60 * 60 * 1000,
  minBarracoLevel: 5,
  tickMs: 30 * 1000,
  qgBaseCapacityPerBarracoLevel: 100,
  factionMemberCapacityBonus: 100,
  factionLevelCapacityBonus: 250,
  ctCapacityRatio: 0.40,
  ctDamagePercentPerTick: 0.015,
  ctDamageMinPerTick: 25,
  ctDamageMaxPerTick: 300,
  maxPacksPerPlayerPerMandate: 2,
  maxServantsPerMandate: 3,
};

export const QG_LOCATIONS = [
  {
    key: 'qg',
    kind: 'qg',
    name: 'QG Central',
    shortName: 'QG',
    mapBuildingKey: 'qg',
    description: 'Prédio central do mapa. Das 18h à meia-noite, vence a facção que somar mais tempo ocupando o QG.',
    position: { x: 0, z: 0 },
    accent: '#facc15',
  },
  {
    key: 'ct_nw',
    kind: 'ct',
    name: 'CT Norte Oeste',
    shortName: 'CT Noroeste',
    mapBuildingKey: 'ct_nw',
    description: 'Fortaleza de cerco. Se for inimiga do QG, causa desgaste a cada 30s.',
    position: { x: -52, z: -52 },
    accent: '#38bdf8',
  },
  {
    key: 'ct_ne',
    kind: 'ct',
    name: 'CT Norte Leste',
    shortName: 'CT Nordeste',
    mapBuildingKey: 'ct_ne',
    description: 'Fortaleza de cerco. Pressiona a guarnição do QG quando controlada por rival.',
    position: { x: 52, z: -52 },
    accent: '#a855f7',
  },
  {
    key: 'ct_sw',
    kind: 'ct',
    name: 'CT Sul Oeste',
    shortName: 'CT Sudoeste',
    mapBuildingKey: 'ct_sw',
    description: 'Fortaleza de cerco. Dominar CTs reduz o risco de segurar o QG.',
    position: { x: -52, z: 52 },
    accent: '#22c55e',
  },
  {
    key: 'ct_se',
    kind: 'ct',
    name: 'CT Sul Leste',
    shortName: 'CT Sudeste',
    mapBuildingKey: 'ct_se',
    description: 'Fortaleza de cerco. Quatro CTs inimigos tornam o QG quase impossível de segurar.',
    position: { x: 52, z: 52 },
    accent: '#ef4444',
  },
];

export const QG_LOCATION_KEYS = QG_LOCATIONS.map((item) => item.key);
export const QG_CT_KEYS = QG_LOCATIONS.filter((item) => item.kind === 'ct').map((item) => item.key);

export const QG_MEMBER_TYPES = [
  'capanga', 'frente', 'executor', 'assassino',
  'muralha', 'certeiro', 'motorista', 'nitro',
];

export const QG_MANDATE_ROLES = [
  {
    id: 'lider_complexo',
    title: 'Líder do Complexo',
    description: 'Cargo máximo do mandato. Nomeia cargos, comanda decretos e representa a facção vencedora.',
    percent: { rajada: 5, blindagem: 5, folego: 3, quebra: 3 },
    powers: ['abilities', 'packs', 'servants', 'appoint'],
  },
  {
    id: 'sub_lider',
    title: 'Sub Líder',
    description: 'Segundo comando do mandato. Mantém a administração do QG quando o líder está fora.',
    percent: { rajada: 3, blindagem: 3, folego: 2, quebra: 2 },
    powers: ['abilities', 'packs'],
  },
  {
    id: 'seguranca',
    title: 'Segurança',
    description: 'Responsável por segurar o QG e reduzir perdas defensivas da facção.',
    percent: { rajada: 0, blindagem: 5, folego: 5, quebra: 0 },
    powers: ['defense_abilities'],
  },
  {
    id: 'tesoureiro',
    title: 'Tesoureiro',
    description: 'Controla pacotes e cofre do mandato. Também fortalece sustentação tática.',
    percent: { rajada: 0, blindagem: 2, folego: 3, quebra: 0 },
    powers: ['packs', 'treasury_abilities'],
  },
];

export const QG_MANDATE_FACTION_BUFF = {
  idPrefix: 'tomada_qg_mandato_faccao',
  source: 'evento',
  label: 'Mandato do QG',
  targetScope: 'global',
  percent: { rajada: 3, blindagem: 3, folego: 2, quebra: 2 },
  flat: { rajada: 0, blindagem: 0, folego: 0, quebra: 0 },
};

export const QG_MANDATE_ABILITIES = [
  {
    id: 'tregua_complexo',
    title: 'Trégua do Complexo',
    description: 'Ativa proteção PvP de 4 horas para todos os membros da facção vencedora.',
    cost: { dirtyMoney: 200000, cleanMoney: 0, corre: 0 },
    durationMs: 4 * 60 * 60 * 1000,
    allowedRoles: ['lider_complexo', 'sub_lider'],
    effect: 'pvp_truce',
  },
  {
    id: 'tratamento_emergencial',
    title: 'Tratamento Emergencial',
    description: 'Acelera a recuperação dos feridos da facção e reduz imediatamente parte do tempo de enfermaria.',
    cost: { dirtyMoney: 50000, cleanMoney: 0, corre: 0 },
    durationMs: 60 * 60 * 1000,
    allowedRoles: ['lider_complexo', 'sub_lider', 'seguranca'],
    effect: 'emergency_heal',
  },
  {
    id: 'apropriacao',
    title: 'Apropriação',
    description: 'Converte verba suja do Cofre do Complexo em Commands Limpo para o próprio cofre.',
    cost: { dirtyMoney: 10000, cleanMoney: 0, corre: 0 },
    rewardTreasury: { cleanMoney: 1200, dirtyMoney: 0, corre: 0 },
    allowedRoles: ['lider_complexo', 'tesoureiro'],
    effect: 'treasury_convert',
  },
];

export const QG_REWARD_PACKS = [
  {
    id: 'pacote_rua',
    title: 'Pacote Rua',
    description: 'Pacote pequeno para premiar participação básica no mandato.',
    cost: { dirtyMoney: 12000, cleanMoney: 250, corre: 2 },
    reward: { dirtyMoney: 9000, cleanMoney: 160, corre: 2, barracoAcceleratorSeconds: 10 * 60, convoyAcceleratorTwoX: 0 },
    allowedRoles: ['lider_complexo', 'sub_lider', 'tesoureiro'],
  },
  {
    id: 'pacote_operacao',
    title: 'Pacote Operação',
    description: 'Pacote médio para operadores que seguraram QG ou CTs.',
    cost: { dirtyMoney: 45000, cleanMoney: 900, corre: 8 },
    reward: { dirtyMoney: 32000, cleanMoney: 620, corre: 6, barracoAcceleratorSeconds: 30 * 60, convoyAcceleratorTwoX: 1 },
    allowedRoles: ['lider_complexo', 'sub_lider', 'tesoureiro'],
  },
  {
    id: 'pacote_dominio',
    title: 'Pacote Domínio',
    description: 'Pacote premium do mandato, limitado pelo cofre e pela participação da facção.',
    cost: { dirtyMoney: 125000, cleanMoney: 2600, corre: 22 },
    reward: { dirtyMoney: 90000, cleanMoney: 1800, corre: 16, barracoAcceleratorSeconds: 90 * 60, convoyAcceleratorTwoX: 3 },
    allowedRoles: ['lider_complexo', 'tesoureiro'],
  },
];

export const QG_SERVANT_PENALTIES = [
  {
    id: 'alvo_marcado',
    title: 'Alvo Marcado',
    description: 'Penalidade tática para rival do mandato. Reduz rajada e quebra até o fim do mandato.',
    percent: { rajada: -3, blindagem: 0, folego: 0, quebra: -3 },
    allowedRoles: ['lider_complexo'],
  },
  {
    id: 'devedor_complexo',
    title: 'Devedor do Complexo',
    description: 'Penalidade de pressão. Reduz blindagem e fôlego até o fim do mandato.',
    percent: { rajada: 0, blindagem: -3, folego: -3, quebra: 0 },
    allowedRoles: ['lider_complexo'],
  },
  {
    id: 'informante_exposto',
    title: 'Informante Exposto',
    description: 'Penalidade geral leve para alvo rival exposto pela administração do QG.',
    percent: { rajada: -2, blindagem: -2, folego: -2, quebra: -2 },
    allowedRoles: ['lider_complexo'],
  },
];

export function getQgLocation(key) {
  return QG_LOCATIONS.find((item) => item.key === String(key || '')) || null;
}

export function getQGMandateRole(roleId) {
  return QG_MANDATE_ROLES.find((item) => item.id === String(roleId || '')) || null;
}

export function getQGMandateAbility(abilityId) {
  return QG_MANDATE_ABILITIES.find((item) => item.id === String(abilityId || '')) || null;
}

export function getQGRewardPack(packId) {
  return QG_REWARD_PACKS.find((item) => item.id === String(packId || '')) || null;
}

export function getQGServantPenalty(penaltyId) {
  return QG_SERVANT_PENALTIES.find((item) => item.id === String(penaltyId || '')) || null;
}

export function emptyByType() {
  return Object.fromEntries(QG_MEMBER_TYPES.map((type) => [type, 0]));
}

export function normalizeQGSelection(selection = {}) {
  const out = emptyByType();
  for (const type of QG_MEMBER_TYPES) {
    out[type] = Math.max(0, Math.floor(Number(selection?.[type] || 0)));
  }
  return out;
}

export function hasAnyQGSelection(selection = {}) {
  return Object.values(normalizeQGSelection(selection)).some((value) => value > 0);
}

export function getQGIndividualReward({ contribution = 0, rank = 999, winner = false } = {}) {
  const safeContribution = Math.max(0, Math.floor(Number(contribution) || 0));
  const rankBonus = rank === 1 ? 1.5 : rank === 2 ? 1.3 : rank === 3 ? 1.18 : 1;
  const winnerBonus = winner ? 1.2 : 1;
  const tier = safeContribution >= 5000 ? 5 : safeContribution >= 3000 ? 4 : safeContribution >= 1500 ? 3 : safeContribution >= 600 ? 2 : safeContribution >= 150 ? 1 : 0;
  const mult = rankBonus * winnerBonus;

  return {
    cleanMoney: Math.floor((180 + safeContribution * 0.42) * mult),
    dirtyMoney: Math.floor((3500 + safeContribution * 9) * mult),
    corre: Math.floor((4 + tier * 2 + safeContribution / 1200) * mult),
    battlePrestige: Math.floor((18 + safeContribution / 22) * mult),
    barracoAcceleratorSeconds: tier * 20 * 60,
    convoyAcceleratorTwoX: Math.max(0, Math.min(6, tier - 1)),
  };
}

export function getQGFactionReward({ contribution = 0, memberCount = 1 } = {}) {
  const score = Math.max(0, Math.floor(Number(contribution) || 0));
  const members = Math.max(1, Math.floor(Number(memberCount) || 1));
  return {
    factionExp: Math.min(5000, Math.floor(250 + score / 10 + members * 8)),
    cityTreasury: {
      cleanMoney: Math.min(300000, Math.floor(6000 + score * 0.55 + members * 200)),
      dirtyMoney: Math.min(1800000, Math.floor(55000 + score * 8 + members * 1600)),
      corre: Math.min(1200, Math.floor(45 + score / 170 + members * 2)),
    },
  };
}
