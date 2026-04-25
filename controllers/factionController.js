import Faction from '../models/Faction.js';
import Player from '../models/Player.js';
import { generateId, bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';

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
  return BRANCHES.reduce(
    (sum, branch) => sum + Math.max(0, safeNumber(investments[branch], 0)),
    0
  );
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
    enemyFactionIds: Array.isArray(faction.enemyFactionIds)
      ? faction.enemyFactionIds.map(String)
      : [],
    allyFactionIds: Array.isArray(faction.allyFactionIds)
      ? faction.allyFactionIds.map(String)
      : [],

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
      donationEfficiencyPercent: safeNumber(
        faction.investmentBuffs?.donationEfficiencyPercent,
        0
      ),
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

    addFactionActivity(faction, 'member_joined', player, player, {
      reason: 'faction_created',
    });
    refreshFactionDerivedFields(faction);
    await faction.save();

    player.factionId = faction.id;
    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

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
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });
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

    const faction = await Faction.findOne({ id: factionId });

    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    refreshFactionDerivedFields(faction);

    if (faction.members.some((member) => String(member.playerId) === String(player._id))) {
      player.factionId = faction.id;
      bumpVersion(player);
      await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

      return res.json({
        faction: normalizeFactionDocument(faction),
      });
    }

    if (faction.members.length >= MAX_FACTION_MEMBERS) {
      return res.status(400).json({ error: 'A facção já atingiu o limite de membros' });
    }

    if (faction.isPrivate) {
      return res.status(403).json({ error: 'Esta facção é privada' });
    }

    if (safeNumber(player.power, 0) < safeNumber(faction.minimumPower, 0)) {
      return res.status(403).json({ error: 'Power insuficiente para entrar nesta facção' });
    }

    if (
      safeNumber(player.niveis?.barracoLevel, 1) <
      safeNumber(faction.minimumBarracoLevel, 1)
    ) {
      return res
        .status(403)
        .json({ error: 'Nível de barraco insuficiente para entrar nesta facção' });
    }

    const newMember = buildFactionMemberFromPlayer(player, 'member');
    faction.members.push(newMember);

    addFactionActivity(faction, 'member_joined', player, player, { via: 'public_join' });
    addFactionExp(faction, 20);
    refreshFactionDerivedFields(faction);

    await faction.save();

    player.factionId = faction.id;
    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao entrar na facção:', error);
    return res.status(500).json({ error: 'Erro ao entrar na facção' });
  }
}

export async function leaveFaction(req, res) {
  try {
    const player = req.player;

    if (!player.factionId) {
      return res.status(400).json({ error: 'Você não pertence a nenhuma facção' });
    }

    const faction = await Faction.findOne({ id: String(player.factionId) });

if (!faction) {
      player.factionId = null;
      bumpVersion(player);
      await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

      return res.json({ success: true, factionDeleted: false, faction: null });
    }

    const playerId = String(player._id);
    const leavingMember =
      faction.members.find((member) => String(member.playerId) === playerId) || null;
    const isLeader = String(faction.leaderId) === playerId;

    faction.members = faction.members.filter(
      (member) => String(member.playerId) !== playerId
    );

    player.factionId = null;
    bumpVersion(player);
    await player.save();

    if (faction.members.length === 0) {
      await Faction.deleteOne({ _id: faction._id });

      return res.json({
        success: true,
        factionDeleted: true,
        faction: null,
      });
    }

    if (isLeader) {
      const nextLeader = faction.members[0];
      faction.leaderId = String(nextLeader.playerId);
      nextLeader.role = 'leader';
      nextLeader.permissions = getDefaultPermissionsByRole('leader');

      addFactionActivity(faction, 'leadership_transferred', leavingMember || player, nextLeader, {
        reason: 'leader_left',
      });
    }

    addFactionActivity(faction, 'member_left', player, leavingMember || player, {});
    refreshFactionDerivedFields(faction);
    await faction.save();

    return res.json({
      success: true,
      factionDeleted: false,
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao sair da facção:', error);
    return res.status(500).json({ error: 'Erro ao sair da facção' });
  }
}

export async function donate(req, res) {
  try {
    const player = req.player;
    const currency = normalizeText(req.body?.currency, 20);
    const amount = Math.floor(safeNumber(req.body?.amount, 0));

    if (!player.factionId) {
      return res.status(400).json({ error: 'Você não pertence a nenhuma facção' });
    }

    if (!['dirtyMoney', 'cleanMoney', 'corre'].includes(currency)) {
      return res.status(400).json({ error: 'Moeda inválida para doação' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Valor inválido para doação' });
    }

    const faction = await getFactionByPlayer(player);

    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    const member = faction.members.find(
      (item) => String(item.playerId) === String(player._id)
    );

    if (!member) {
      return res.status(403).json({ error: 'Você não consta como membro dessa facção' });
    }

    if (safeNumber(player.balances?.[currency], 0) < amount) {
      return res.status(400).json({ error: 'Saldo insuficiente' });
    }

    player.balances[currency] -= amount;
    bumpVersion(player);
    await player.save();

    faction.treasury[currency] =
      Math.max(0, safeNumber(faction.treasury?.[currency], 0)) + amount;

    member.contribution[currency] =
      Math.max(0, safeNumber(member.contribution?.[currency], 0)) + amount;

    const dirtyWeight = currency === 'dirtyMoney' ? 1 : 0;
    const cleanWeight = currency === 'cleanMoney' ? 1 : 0;
    const correWeight = currency === 'corre' ? 1 : 0.5;

    member.contribution.totalValue =
      Math.max(0, safeNumber(member.contribution?.totalValue, 0)) +
      amount * (dirtyWeight + cleanWeight + correWeight);

    const expGain = Math.max(1, Math.floor(amount / 5000));
    addFactionExp(faction, expGain);

    addFactionActivity(faction, 'donation', player, player, {
      currency,
      amount,
      expGain,
    });

    refreshFactionDerivedFields(faction);
    await faction.save();

    return res.json({
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao doar para facção:', error);
    return res.status(500).json({ error: 'Erro ao doar para facção' });
  }
}

export async function invest(req, res) {
  try {
    const player = req.player;
    const branch = normalizeText(req.body?.branch, 40);

    if (!player.factionId) {
      return res.status(400).json({ error: 'Você não pertence a nenhuma facção' });
    }

    if (!BRANCHES.includes(branch)) {
      return res.status(400).json({ error: 'Ramo de investimento inválido' });
    }

    const faction = await getFactionByPlayer(player);
    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    const hasPermission = requireFactionPermission(
      faction,
      String(player._id),
      'canManageInvestments'
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Sem permissão para investir pela facção' });
    }

    refreshFactionDerivedFields(faction);

    const currentLevel = Math.max(0, safeNumber(faction.investments?.[branch], 0));
    if (currentLevel >= MAX_BRANCH_LEVEL) {
      return res.status(400).json({ error: 'Este ramo já atingiu o nível máximo' });
    }

    const cost = getInvestmentUpgradeCost(branch, currentLevel);
    if (safeNumber(faction.treasury?.cleanMoney, 0) < safeNumber(cost.cleanMoney, 0)) {
      return res
        .status(400)
        .json({ error: 'Tesouro limpo insuficiente para esse investimento' });
    }

    faction.treasury.cleanMoney -= cost.cleanMoney;
    faction.investments[branch] = currentLevel + 1;

    faction.investmentLog.push({
      id: generateId(),
      branch,
      levelBefore: currentLevel,
      levelAfter: currentLevel + 1,
      cost: {
        cleanMoney: cost.cleanMoney,
      },
      upgradedByPlayerId: String(player._id),
      upgradedByPlayerName: player.name || 'Jogador',
      createdAt: nowIso(),
    });

    if (faction.investmentLog.length > 200) {
      faction.investmentLog = faction.investmentLog.slice(-200);
    }

    const expGain = 25 + currentLevel * 3;
    addFactionExp(faction, expGain);

    addFactionActivity(faction, 'investment_upgraded', player, null, {
      branch,
      levelBefore: currentLevel,
      levelAfter: currentLevel + 1,
      cost,
      expGain,
    });

    refreshFactionDerivedFields(faction);
    await faction.save();

    return res.json({
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao investir na facção:', error);
    return res.status(500).json({ error: 'Erro ao investir na facção' });
  }
}

export async function updateSettings(req, res) {
  try {
    const player = req.player;
    const faction = await getFactionByPlayer(player);

    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    if (String(faction.leaderId) !== String(player._id)) {
      return res.status(403).json({ error: 'Somente o líder pode alterar as configurações' });
    }

    if (typeof req.body?.description !== 'undefined') {
      faction.description = normalizeText(req.body.description, 180);
    }

    if (typeof req.body?.isPrivate !== 'undefined') {
      faction.isPrivate = Boolean(req.body.isPrivate);
    }

    if (typeof req.body?.minimumPower !== 'undefined') {
      faction.minimumPower = Math.max(0, safeNumber(req.body.minimumPower, 0));
    }

    if (typeof req.body?.minimumBarracoLevel !== 'undefined') {
      faction.minimumBarracoLevel = Math.max(1, safeNumber(req.body.minimumBarracoLevel, 1));
    }

    if (typeof req.body?.allowMemberInvites !== 'undefined') {
      faction.allowMemberInvites = Boolean(req.body.allowMemberInvites);
    }

    if (typeof req.body?.allowJoinRequests !== 'undefined') {
      faction.allowJoinRequests = Boolean(req.body.allowJoinRequests);
    }

    if (typeof req.body?.autoAcceptRequests !== 'undefined') {
      faction.autoAcceptRequests = Boolean(req.body.autoAcceptRequests);
    }

    addFactionActivity(faction, 'settings_updated', player, null, {
      description: faction.description,
      isPrivate: faction.isPrivate,
      minimumPower: faction.minimumPower,
      minimumBarracoLevel: faction.minimumBarracoLevel,
      allowMemberInvites: faction.allowMemberInvites,
      allowJoinRequests: faction.allowJoinRequests,
      autoAcceptRequests: faction.autoAcceptRequests,
    });

    refreshFactionDerivedFields(faction);
    await faction.save();

    return res.json({
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao atualizar configurações da facção:', error);
    return res.status(500).json({ error: 'Erro ao atualizar configurações da facção' });
  }
}

export async function updateMemberRole(req, res) {
  try {
    const player = req.player;
    const targetPlayerId = normalizeText(req.body?.targetPlayerId, 80);
    const role = normalizeText(req.body?.role, 30);

    if (!targetPlayerId || !role) {
      return res.status(400).json({ error: 'targetPlayerId e role são obrigatórios' });
    }

    if (
      !['leader', 'subleader', 'recruiter', 'treasurer', 'diplomat', 'member'].includes(role)
    ) {
      return res.status(400).json({ error: 'Cargo inválido' });
    }

    const faction = await getFactionByPlayer(player);
    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    if (String(faction.leaderId) !== String(player._id)) {
      return res.status(403).json({ error: 'Somente o líder pode alterar cargos' });
    }

    const targetMember = faction.members.find(
      (member) => String(member.playerId) === String(targetPlayerId)
    );

    if (!targetMember) {
      return res.status(404).json({ error: 'Membro não encontrado na facção' });
    }

    if (String(targetPlayerId) === String(player._id) && role !== 'leader') {
      return res.status(400).json({ error: 'O líder não pode rebaixar a si mesmo por aqui' });
    }

    targetMember.role = role;
    targetMember.permissions = getDefaultPermissionsByRole(role);

    if (role === 'leader') {
      const currentLeader = faction.members.find(
        (member) => String(member.playerId) === String(faction.leaderId)
      );

      if (currentLeader) {
        currentLeader.role = 'member';
        currentLeader.permissions = getDefaultPermissionsByRole('member');
      }

      faction.leaderId = String(targetPlayerId);
    }

    addFactionActivity(faction, 'role_updated', player, targetMember, {
      newRole: role,
    });

    refreshFactionDerivedFields(faction);
    await faction.save();

    return res.json({
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao atualizar cargo do membro:', error);
    return res.status(500).json({ error: 'Erro ao atualizar cargo do membro' });
  }
}

export async function kickMember(req, res) {
  try {
    const player = req.player;
    const memberId = normalizeText(req.body?.memberId, 80);

    if (!memberId) {
      return res.status(400).json({ error: 'memberId é obrigatório' });
    }

    const faction = await getFactionByPlayer(player);
    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    if (String(faction.leaderId) !== String(player._id)) {
      return res.status(403).json({ error: 'Somente o líder pode expulsar membros' });
    }

    if (String(memberId) === String(player._id)) {
      return res.status(400).json({ error: 'O líder não pode expulsar a si mesmo' });
    }

    const targetMember = faction.members.find(
      (member) => String(member.playerId) === String(memberId)
    );

    if (!targetMember) {
      return res.status(404).json({ error: 'Membro não encontrado na facção' });
    }

    faction.members = faction.members.filter(
      (member) => String(member.playerId) !== String(memberId)
    );

    addFactionActivity(faction, 'member_kicked', player, targetMember, {});
    refreshFactionDerivedFields(faction);

    await faction.save();
    await clearPlayerFaction(memberId);

    return res.json({
      success: true,
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao expulsar membro:', error);
    return res.status(500).json({ error: 'Erro ao expulsar membro' });
  }
}

export async function transferLeadership(req, res) {
  try {
    const player = req.player;
    const memberId = normalizeText(req.body?.memberId, 80);

    if (!memberId) {
      return res.status(400).json({ error: 'memberId é obrigatório' });
    }

    const faction = await getFactionByPlayer(player);
    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    if (String(faction.leaderId) !== String(player._id)) {
      return res.status(403).json({ error: 'Somente o líder pode transferir a liderança' });
    }

    const newLeader = faction.members.find(
      (member) => String(member.playerId) === String(memberId)
    );

    if (!newLeader) {
      return res.status(404).json({ error: 'Membro não encontrado na facção' });
    }

    const currentLeader = faction.members.find(
      (member) => String(member.playerId) === String(faction.leaderId)
    );

    if (currentLeader) {
      currentLeader.role = 'member';
      currentLeader.permissions = getDefaultPermissionsByRole('member');
    }

    newLeader.role = 'leader';
    newLeader.permissions = getDefaultPermissionsByRole('leader');
    faction.leaderId = String(newLeader.playerId);

    addFactionActivity(faction, 'leadership_transferred', player, newLeader, {});
    refreshFactionDerivedFields(faction);
    await faction.save();

    return res.json({
      success: true,
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao transferir liderança:', error);
    return res.status(500).json({ error: 'Erro ao transferir liderança' });
  }
}

export async function acceptJoinRequest(req, res) {
  try {
    const player = req.player;
    const targetPlayerId = normalizeText(req.body?.targetPlayerId, 80);

    if (!targetPlayerId) {
      return res.status(400).json({ error: 'targetPlayerId é obrigatório' });
    }

    const faction = await getFactionByPlayer(player);
    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    const isLeader = String(faction.leaderId) === String(player._id);
    const canAccept = requireFactionPermission(
      faction,
      String(player._id),
      'canAcceptRequests'
    );

    if (!isLeader && !canAccept) {
      return res.status(403).json({ error: 'Sem permissão para aceitar solicitações' });
    }

    refreshFactionDerivedFields(faction);

    const joinRequest = faction.joinRequests.find(
      (item) => String(item.playerId) === String(targetPlayerId)
    );

    if (!joinRequest) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    if (faction.members.length >= MAX_FACTION_MEMBERS) {
      return res.status(400).json({ error: 'A facção já atingiu o limite de membros' });
    }

    const targetPlayer = await Player.findById(targetPlayerId);
    if (!targetPlayer) {
      faction.joinRequests = faction.joinRequests.filter(
        (item) => String(item.playerId) !== String(targetPlayerId)
      );
      await faction.save();
      return res.status(404).json({ error: 'Jogador não encontrado' });
    }

    if (targetPlayer.factionId) {
      faction.joinRequests = faction.joinRequests.filter(
        (item) => String(item.playerId) !== String(targetPlayerId)
      );
      await faction.save();
      return res.status(400).json({ error: 'Jogador já está em uma facção' });
    }

    const newMember = buildFactionMemberFromPlayer(targetPlayer, 'member');
    faction.members.push(newMember);

    faction.joinRequests = faction.joinRequests.filter(
      (item) => String(item.playerId) !== String(targetPlayerId)
    );

    addFactionActivity(faction, 'member_joined', player, targetPlayer, {
      via: 'join_request_accepted',
    });

    addFactionExp(faction, 20);
    refreshFactionDerivedFields(faction);
    await faction.save();

    targetPlayer.factionId = faction.id;
    bumpVersion(targetPlayer);
    await targetPlayer.save();

    return res.json({
      success: true,
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao aceitar solicitação:', error);
    return res.status(500).json({ error: 'Erro ao aceitar solicitação' });
  }
}

export async function rejectJoinRequest(req, res) {
  try {
    const player = req.player;
    const targetPlayerId = normalizeText(req.body?.targetPlayerId, 80);

    if (!targetPlayerId) {
      return res.status(400).json({ error: 'targetPlayerId é obrigatório' });
    }

    const faction = await getFactionByPlayer(player);
    if (!faction) {
      return res.status(404).json({ error: 'Facção não encontrada' });
    }

    const isLeader = String(faction.leaderId) === String(player._id);
    const canAccept = requireFactionPermission(
      faction,
      String(player._id),
      'canAcceptRequests'
    );

    if (!isLeader && !canAccept) {
      return res.status(403).json({ error: 'Sem permissão para recusar solicitações' });
    }

    const joinRequest = faction.joinRequests.find(
      (item) => String(item.playerId) === String(targetPlayerId)
    );

    if (!joinRequest) {
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    faction.joinRequests = faction.joinRequests.filter(
      (item) => String(item.playerId) !== String(targetPlayerId)
    );

    addFactionActivity(faction, 'request_rejected', player, joinRequest, {});
    refreshFactionDerivedFields(faction);
    await faction.save();

    return res.json({
      success: true,
      faction: normalizeFactionDocument(faction),
    });
  } catch (error) {
    console.error('Erro ao recusar solicitação:', error);
    return res.status(500).json({ error: 'Erro ao recusar solicitação' });
  }
}