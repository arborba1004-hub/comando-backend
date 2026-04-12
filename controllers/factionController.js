import Faction from '../models/Faction.js';
import Player from '../models/Player.js';
import { generateId, bumpVersion } from '../utils/gameHelpers.js';

const MAX_FACTION_MEMBERS = 30;
const MAX_BRANCH_LEVEL = 20;

const BRANCHES = [
  'arsenalColetivo',
  'caixaOperacional',
  'mobilidade',
  'influencia',
  'inteligencia',
  'fortificacao',
  'logistica',
  'doutrina',
];

const DEFAULT_INVESTMENTS = {
  arsenalColetivo: 0,
  caixaOperacional: 0,
  mobilidade: 0,
  influencia: 0,
  inteligencia: 0,
  fortificacao: 0,
  logistica: 0,
  doutrina: 0,
};

const DEFAULT_INVESTMENT_BUFFS = {
  attackPercent: 0,
  defensePercent: 0,
  hpPercent: 0,
  dirtyMoneyGainPercent: 0,
  cleanMoneyGainPercent: 0,
  agilityPercent: 0,
  intelligencePercent: 0,
  respectPercent: 0,
  baseDefensePercent: 0,
  donationEfficiencyPercent: 0,
  buffDurationPercent: 0,
};

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value, maxLength = 60) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeTag(value) {
  return normalizeText(value, 8).toUpperCase();
}

function getDefaultPermissionsByRole(role = 'member') {
  switch (role) {
    case 'leader':
      return {
        canInvite: true,
        canAcceptRequests: true,
        canManageTreasury: true,
        canManageInvestments: true,
        canManageDiplomacy: true,
        canStartEvents: true,
      };
    case 'subleader':
      return {
        canInvite: true,
        canAcceptRequests: true,
        canManageTreasury: true,
        canManageInvestments: true,
        canManageDiplomacy: true,
        canStartEvents: true,
      };
    case 'recruiter':
      return {
        canInvite: true,
        canAcceptRequests: true,
        canManageTreasury: false,
        canManageInvestments: false,
        canManageDiplomacy: false,
        canStartEvents: false,
      };
    case 'treasurer':
      return {
        canInvite: false,
        canAcceptRequests: false,
        canManageTreasury: true,
        canManageInvestments: true,
        canManageDiplomacy: false,
        canStartEvents: false,
      };
    case 'diplomat':
      return {
        canInvite: false,
        canAcceptRequests: false,
        canManageTreasury: false,
        canManageInvestments: false,
        canManageDiplomacy: true,
        canStartEvents: false,
      };
    default:
      return {
        canInvite: false,
        canAcceptRequests: false,
        canManageTreasury: false,
        canManageInvestments: false,
        canManageDiplomacy: false,
        canStartEvents: false,
      };
  }
}

function calculateInvestmentBuffs(investments = DEFAULT_INVESTMENTS) {
  const arsenal = Math.max(0, safeNumber(investments.arsenalColetivo, 0));
  const caixa = Math.max(0, safeNumber(investments.caixaOperacional, 0));
  const mobilidade = Math.max(0, safeNumber(investments.mobilidade, 0));
  const influencia = Math.max(0, safeNumber(investments.influencia, 0));
  const inteligencia = Math.max(0, safeNumber(investments.inteligencia, 0));
  const fortificacao = Math.max(0, safeNumber(investments.fortificacao, 0));
  const logistica = Math.max(0, safeNumber(investments.logistica, 0));
  const doutrina = Math.max(0, safeNumber(investments.doutrina, 0));

  return {
    attackPercent: arsenal * 2 + doutrina * 0.5,
    defensePercent: arsenal * 1.5 + fortificacao * 2 + doutrina * 0.5,
    hpPercent: arsenal * 1 + fortificacao * 1.5 + doutrina * 0.5,
    dirtyMoneyGainPercent: caixa * 2 + doutrina * 0.5,
    cleanMoneyGainPercent: caixa * 1.5 + doutrina * 0.5,
    agilityPercent: mobilidade * 2 + doutrina * 0.5,
    intelligencePercent: inteligencia * 2 + doutrina * 0.5,
    respectPercent: influencia * 2 + doutrina * 0.5,
    baseDefensePercent: fortificacao * 2 + doutrina * 0.5,
    donationEfficiencyPercent: logistica * 2 + doutrina * 0.5,
    buffDurationPercent: logistica * 1.5 + doutrina * 0.5,
  };
}

function calculateTotalInvestmentLevel(investments = DEFAULT_INVESTMENTS) {
  return BRANCHES.reduce((sum, branch) => sum + Math.max(0, safeNumber(investments[branch], 0)), 0);
}

function getTierName(totalLevel) {
  if (totalLevel >= 150) return 'Supremo Comando';
  if (totalLevel >= 140) return 'Império do Asfalto';
  if (totalLevel >= 130) return 'Conselho Soberano';
  if (totalLevel >= 120) return 'Domínio Absoluto';
  if (totalLevel >= 110) return 'Elite do Comando';
  if (totalLevel >= 100) return 'Cúpula de Guerra';
  if (totalLevel >= 90) return 'Organização Blindada';
  if (totalLevel >= 80) return 'Clã de Ouro';
  if (totalLevel >= 70) return 'Tropa Dominante';
  if (totalLevel >= 60) return 'Frente de Elite';
  if (totalLevel >= 50) return 'Comando Pesado';
  if (totalLevel >= 40) return 'Linha de Frente';
  if (totalLevel >= 30) return 'Núcleo Estruturado';
  if (totalLevel >= 20) return 'Tropa Organizada';
  if (totalLevel >= 10) return 'Bonde em Ascensão';
  return 'Turma de Esquina';
}

function getInvestmentUpgradeCost(branch, currentLevel) {
  const baseByBranch = {
    arsenalColetivo: 50000,
    caixaOperacional: 45000,
    mobilidade: 42000,
    influencia: 38000,
    inteligencia: 47000,
    fortificacao: 52000,
    logistica: 40000,
    doutrina: 65000,
  };

  const baseCost = safeNumber(baseByBranch[branch], 50000);
  const safeLevel = Math.max(0, safeNumber(currentLevel, 0));

  return {
    cleanMoney: Math.round(baseCost * Math.pow(1.22, safeLevel)),
  };
}

function buildFactionMemberFromPlayer(player, role = 'member') {
  return {
    playerId: String(player._id),
    playerName: player.name || 'Jogador',
    avatar: player.avatar || '',
    role,
    joinedAt: nowIso(),
    lastSeenAt: nowIso(),
    power: safeNumber(player.power, 0),
    barracoLevel: Math.max(1, safeNumber(player.niveis?.barracoLevel, 1)),
    hierarchyBadge: player.hierarchyBadge || '',
    permissions: getDefaultPermissionsByRole(role),
    contribution: {
      dirtyMoney: 0,
      cleanMoney: 0,
      corre: 0,
      totalValue: 0,
    },
  };
}

function refreshFactionDerivedFields(faction) {
  if (!faction.investments) {
    faction.investments = { ...DEFAULT_INVESTMENTS };
  }

  faction.investmentBuffs = calculateInvestmentBuffs(faction.investments);
  faction.totalInvestmentLevel = calculateTotalInvestmentLevel(faction.investments);
  faction.investmentTierName = getTierName(faction.totalInvestmentLevel);

  if (!faction.treasury) {
    faction.treasury = { dirtyMoney: 0, cleanMoney: 0, corre: 0 };
  }

  if (!Array.isArray(faction.members)) faction.members = [];
  if (!Array.isArray(faction.joinRequests)) faction.joinRequests = [];
  if (!Array.isArray(faction.invites)) faction.invites = [];
  if (!Array.isArray(faction.activeBuffs)) faction.activeBuffs = [];
  if (!Array.isArray(faction.enemyFactionIds)) faction.enemyFactionIds = [];
  if (!Array.isArray(faction.allyFactionIds)) faction.allyFactionIds = [];
  if (!Array.isArray(faction.investmentLog)) faction.investmentLog = [];
  if (!Array.isArray(faction.activityLog)) faction.activityLog = [];
}

function addFactionActivity(faction, type, actor = null, target = null, metadata = {}) {
  if (!Array.isArray(faction.activityLog)) faction.activityLog = [];

  faction.activityLog.push({
    id: generateId(),
    type,
    actorPlayerId: actor ? String(actor._id || actor.playerId || '') : '',
    actorPlayerName: actor ? String(actor.name || actor.playerName || 'Sistema') : 'Sistema',
    targetPlayerId: target ? String(target._id || target.playerId || '') : '',
    targetPlayerName: target ? String(target.name || target.playerName || '') : '',
    metadata,
    createdAt: nowIso(),
  });

  if (faction.activityLog.length > 200) {
    faction.activityLog = faction.activityLog.slice(-200);
  }
}

function addFactionExp(faction, amount) {
  const gain = Math.max(0, Math.floor(safeNumber(amount, 0)));
  if (gain <= 0) return;

  faction.exp = Math.max(0, safeNumber(faction.exp, 0)) + gain;
  faction.level = Math.max(1, safeNumber(faction.level, 1));
  faction.expToNext = Math.max(100, safeNumber(faction.expToNext, 100));

  while (faction.exp >= faction.expToNext) {
    faction.exp -= faction.expToNext;
    faction.level += 1;
    faction.expToNext = Math.round(faction.expToNext * 1.18);
  }
}

function normalizeFactionDocument(faction) {
  if (!faction) return null;

  refreshFactionDerivedFields(faction);

  return {
    id: String(faction.id),
    name: String(faction.name),
    tag: String(faction.tag),
    leaderId: String(faction.leaderId),

    level: Math.max(1, safeNumber(faction.level, 1)),
    exp: Math.max(0, safeNumber(faction.exp, 0)),
    expToNext: Math.max(100, safeNumber(faction.expToNext, 100)),

    description: String(faction.description || ''),
    isPrivate: Boolean(faction.isPrivate),
    minimumPower: Math.max(0, safeNumber(faction.minimumPower, 0)),
    minimumBarracoLevel: Math.max(1, safeNumber(faction.minimumBarracoLevel, 1)),
    allowMemberInvites: Boolean(faction.allowMemberInvites),
    allowJoinRequests: Boolean(faction.allowJoinRequests),
    autoAcceptRequests: Boolean(faction.autoAcceptRequests),

    treasury: {
      dirtyMoney: Math.max(0, safeNumber(faction.treasury?.dirtyMoney, 0)),
      cleanMoney: Math.max(0, safeNumber(faction.treasury?.cleanMoney, 0)),
      corre: Math.max(0, safeNumber(faction.treasury?.corre, 0)),
    },

    members: Array.isArray(faction.members)
      ? faction.members.map((member) => ({
          playerId: String(member.playerId),
          playerName: String(member.playerName || 'Jogador'),
          avatar: String(member.avatar || ''),
          role: String(member.role || 'member'),
          joinedAt: String(member.joinedAt || nowIso()),
          lastSeenAt: String(member.lastSeenAt || nowIso()),
          power: Math.max(0, safeNumber(member.power, 0)),
          barracoLevel: Math.max(1, safeNumber(member.barracoLevel, 1)),
          hierarchyBadge: String(member.hierarchyBadge || ''),
          permissions: {
            canInvite: Boolean(member.permissions?.canInvite),
            canAcceptRequests: Boolean(member.permissions?.canAcceptRequests),
            canManageTreasury: Boolean(member.permissions?.canManageTreasury),
            canManageInvestments: Boolean(member.permissions?.canManageInvestments),
            canManageDiplomacy: Boolean(member.permissions?.canManageDiplomacy),
            canStartEvents: Boolean(member.permissions?.canStartEvents),
          },
          contribution: {
            dirtyMoney: Math.max(0, safeNumber(member.contribution?.dirtyMoney, 0)),
            cleanMoney: Math.max(0, safeNumber(member.contribution?.cleanMoney, 0)),
            corre: Math.max(0, safeNumber(member.contribution?.corre, 0)),
            totalValue: Math.max(0, safeNumber(member.contribution?.totalValue, 0)),
          },
        }))
      : [],

    joinRequests: Array.isArray(faction.joinRequests) ? faction.joinRequests : [],
    invites: Array.isArray(faction.invites) ? faction.invites : [],
    activeBuffs: Array.isArray(faction.activeBuffs) ? faction.activeBuffs : [],
    enemyFactionIds: Array.isArray(faction.enemyFactionIds) ? faction.enemyFactionIds.map(String) : [],
    allyFactionIds: Array.isArray(faction.allyFactionIds) ? faction.allyFactionIds.map(String) : [],

    investments: {
      arsenalColetivo: Math.max(0, safeNumber(faction.investments?.arsenalColetivo, 0)),
      caixaOperacional: Math.max(0, safeNumber(faction.investments?.caixaOperacional, 0)),
      mobilidade: Math.max(0, safeNumber(faction.investments?.mobilidade, 0)),
      influencia: Math.max(0, safeNumber(faction.investments?.influencia, 0)),
      inteligencia: Math.max(0, safeNumber(faction.investments?.inteligencia, 0)),
      fortificacao: Math.max(0, safeNumber(faction.investments?.fortificacao, 0)),
      logistica: Math.max(0, safeNumber(faction.investments?.logistica, 0)),
      doutrina: Math.max(0, safeNumber(faction.investments?.doutrina, 0)),
    },

    investmentBuffs: {
      attackPercent: safeNumber(faction.investmentBuffs?.attackPercent, 0),
      defensePercent: safeNumber(faction.investmentBuffs?.defensePercent, 0),
      hpPercent: safeNumber(faction.investmentBuffs?.hpPercent, 0),
      dirtyMoneyGainPercent: safeNumber(faction.investmentBuffs?.dirtyMoneyGainPercent, 0),
      cleanMoneyGainPercent: safeNumber(faction.investmentBuffs?.cleanMoneyGainPercent, 0),
      agilityPercent: safeNumber(faction.investmentBuffs?.agilityPercent, 0),
      intelligencePercent: safeNumber(faction.investmentBuffs?.intelligencePercent, 0),
      respectPercent: safeNumber(faction.investmentBuffs?.respectPercent, 0),
      baseDefensePercent: safeNumber(faction.investmentBuffs?.baseDefensePercent, 0),
      donationEfficiencyPercent: safeNumber(faction.investmentBuffs?.donationEfficiencyPercent, 0),
      buffDurationPercent: safeNumber(faction.investmentBuffs?.buffDurationPercent, 0),
    },

    investmentLog: Array.isArray(faction.investmentLog) ? faction.investmentLog : [],
    totalInvestmentLevel: Math.max(0, safeNumber(faction.totalInvestmentLevel, 0)),
    investmentTierName: String(faction.investmentTierName || 'Turma de Esquina'),
    activityLog: Array.isArray(faction.activityLog) ? faction.activityLog : [],

    createdAt: faction.createdAt ? new Date(faction.createdAt).toISOString() : null,
    updatedAt: faction.updatedAt ? new Date(faction.updatedAt).toISOString() : null,
  };
}

async function syncFactionMemberSnapshot(faction, playerId) {
  const member = faction.members.find((item) => String(item.playerId) === String(playerId));
  if (!member) return;

  const player = await Player.findById(playerId).lean();
  if (!player) return;

  member.playerName = player.name || member.playerName || 'Jogador';
  member.avatar = player.avatar || '';
  member.power = safeNumber(player.power, 0);
  member.barracoLevel = Math.max(1, safeNumber(player.niveis?.barracoLevel, 1));
  member.hierarchyBadge = player.hierarchyBadge || '';
  member.lastSeenAt = nowIso();
}

async function clearPlayerFaction(playerId) {
  const player = await Player.findById(playerId);
  if (!player) return null;

  player.factionId = null;
  bumpVersion(player);
  await player.save();

  return player;
}

async function setPlayerFaction(playerId, factionId) {
  const player = await Player.findById(playerId);
  if (!player) return null;

  player.factionId = factionId;
  bumpVersion(player);
  await player.save();

  return player;
}

async function getFactionByPlayer(player) {
  if (!player?.factionId) return null;
  return Faction.findOne({ id: String(player.factionId) });
}

function requireFactionPermission(faction, playerId, permissionKey) {
  const member = faction.members.find((item) => String(item.playerId) === String(playerId));
  if (!member) return false;
  return Boolean(member.permissions?.[permissionKey]);
}

export async function createFaction(req, res) {
  try {
    const player = req.player;

    const safeName = normalizeText(req.body?.name, 40);
    const safeTag = normalizeTag(req.body?.tag);
    const safeDescription = normalizeText(req.body?.description, 180);

    const isPrivate = Boolean(req.body?.isPrivate);
    const minimumPower = Math.max(0, safeNumber(req.body?.minimumPower, 0));
    const minimumBarracoLevel = Math.max(1, safeNumber(req.body?.minimumBarracoLevel, 1));
    const allowMemberInvites = Boolean(req.body?.allowMemberInvites);
    const allowJoinRequests = Boolean(req.body?.allowJoinRequests ?? true);
    const autoAcceptRequests = Boolean(req.body?.autoAcceptRequests);

    if (!safeName || !safeTag) {
      return res.status(400).json({ error: 'Nome e tag são obrigatórios' });
    }

    if (player.factionId) {
      return res.status(400).json({ error: 'Você já pertence a uma facção' });
    }

    const existingFaction = await Faction.findOne({
      $or: [{ name: safeName }, { tag: safeTag }],
    });

    if (existingFaction) {
      return res.status(400).json({ error: 'Já existe uma facção com esse nome ou tag' });
    }

    const leaderMember = buildFactionMemberFromPlayer(player, 'leader');

    const faction = await Faction.create({
      id: generateId(),
      name: safeName,
      tag: safeTag,
      leaderId: String(player._id),

      level: 1,
      exp: 0,
      expToNext: 100,

      description: safeDescription,
      isPrivate,
      minimumPower,
      minimumBarracoLevel,
      allowMemberInvites,
      allowJoinRequests,
      autoAcceptRequests,

      treasury: {
        dirtyMoney: 0,
        cleanMoney: 0,
        corre: 0,
      },

      members: [leaderMember],
      joinRequests: [],
      invites: [],
      activeBuffs: [],
      enemyFactionIds: [],
      allyFactionIds: [],
      investments: { ...DEFAULT_INVESTMENTS },
      investmentBuffs: { ...DEFAULT_INVESTMENT_BUFFS },
      investmentLog: [],
      totalInvestmentLevel: 0,
      investmentTierName: 'Turma de Esquina',
      activityLog: [],
    });

    addFactionActivity(faction, 'member_joined', player, player, { reason: 'faction_created' });
    refreshFactionDerivedFields(faction);
    await faction.save();

    player.factionId = faction.id;
    bumpVersion(player);
    await player.save();

    return res.status(201).json({
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao criar facção:', error);
    return res.status(500).json({ error: 'Erro ao criar facção' });
  }
}

export async function getMyFaction(req, res) {
  try {
    const player = req.player;

    if (!player.factionId) {
      return res.status(404).json({ error: 'Você não pertence a nenhuma facção' });
    }

    const faction = await Faction.findOne({ id: String(player.factionId) });

    if (!faction) {
      player.factionId = null;
      bumpVersion(player);
      await player.save();
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    await syncFactionMemberSnapshot(faction, player._id);
    refreshFactionDerivedFields(faction);
    await faction.save();

    return res.json({
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao buscar facção:', error);
    return res.status(500).json({ error: 'Erro ao buscar facção' });
  }
}

export async function listFactions(req, res) {
  try {
    const factions = await Faction.find({})
      .sort({ level: -1, totalInvestmentLevel: -1, createdAt: 1 })
      .limit(100);

    const normalized = factions.map((faction) => {
      refreshFactionDerivedFields(faction);
      const data = normalizeFactionDocument(faction);

      return {
        id: data.id,
        name: data.name,
        tag: data.tag,
        leaderId: data.leaderId,
        level: data.level,
        exp: data.exp,
        expToNext: data.expToNext,
        description: data.description,
        isPrivate: data.isPrivate,
        minimumPower: data.minimumPower,
        minimumBarracoLevel: data.minimumBarracoLevel,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        memberCount: Array.isArray(data.members) ? data.members.length : 0,
        totalInvestmentLevel: data.totalInvestmentLevel,
        investmentTierName: data.investmentTierName,
      };
    });

    return res.json({ factions: normalized });
  } catch (error) {
    console.error('Erro ao listar facções:', error);
    return res.status(500).json({ error: 'Erro ao listar facções' });
  }
}

export async function joinFaction(req, res) {
  try {
    const player = req.player;
    const factionId = normalizeText(req.body?.factionId, 80);

    if (!factionId) {
      return res.status(400).json({ error: 'factionId é obrigatório' });
    }

    if (player.factionId) {
      return res.status(400).json({ error: 'Você já pertence a uma facção' });
    }

    const faction = await Faction.findOne(