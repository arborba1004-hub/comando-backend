import Gang from '../models/Gang.js';
import Player from '../models/Player.js';
import { generateId, bumpVersion } from '../utils/gameHelpers.js';

function rarityFromMethod(method) {
  const rarities = ['Comum', 'Raro', 'Épico', 'Lendário', 'Mítico'];
  const weights =
    method === 'premium'
      ? [0, 0, 0.6, 0.3, 0.1]
      : method === 'market'
        ? [0.4, 0.35, 0.15, 0.08, 0.02]
        : [0.6, 0.25, 0.1, 0.04, 0.01];

  const rand = Math.random();
  let acc = 0;

  for (let i = 0; i < weights.length; i += 1) {
    acc += weights[i];
    if (rand < acc) return rarities[i];
  }

  return 'Comum';
}

function makeRecruit(method) {
  const classes = [
    'Assassino',
    'Ladrão',
    'Lavador',
    'Motorista',
    'Armeiro',
    'Informante',
    'Capanga',
    'Médico',
    'Executor',
    'Negociador',
  ];

  return {
    id: generateId(),
    name: `Recruta ${Math.floor(Math.random() * 1000)}`,
    class: classes[Math.floor(Math.random() * classes.length)],
    rarity: rarityFromMethod(method),
    level: 1,
    exp: 0,
    expToNext: 100,
    loyalty: 50 + Math.floor(Math.random() * 50),
    skills: [],
    equipment: {},
    active: false,
    recruitedAt: new Date().toISOString(),
    lastMissionAt: '',
    victories: 0,
    defeats: 0,
  };
}

export async function createGang(req, res) {
  try {
    const { name, tag } = req.body || {};
    const player = req.player;

    if (!name || !tag) {
      return res.status(400).json({ error: 'Nome e tag são obrigatórios' });
    }

    const existingGang = await Gang.findOne({
      $or: [{ name: String(name).trim() }, { tag: String(tag).trim() }],
    });

    if (existingGang) {
      return res.status(400).json({ error: 'Já existe uma gangue com esse nome ou tag' });
    }

    if (player.gangId) {
      return res.status(400).json({ error: 'Você já pertence a uma gangue' });
    }

    const gangId = generateId();

    const leaderMember = {
      id: generateId(),
      name: player.name,
      class: 'Executor',
      rarity: 'Lendário',
      level: 1,
      exp: 0,
      expToNext: 100,
      loyalty: 100,
      skills: [],
      equipment: {},
      active: true,
      recruitedAt: new Date().toISOString(),
      lastMissionAt: '',
      victories: 0,
      defeats: 0,
    };

    const gang = await Gang.create({
      id: gangId,
      name: String(name).trim(),
      tag: String(tag).trim(),
      leaderId: String(player._id),
      members: [leaderMember],
      activeMemberIds: [leaderMember.id],
    });

    player.gangId = gangId;
    bumpVersion(player);
    await player.save();

    return res.status(201).json({ gang });
  } catch (error) {
    console.error('Erro ao criar gangue:', error);
    return res.status(500).json({ error: 'Erro ao criar gangue' });
  }
}

export async function getMyGang(req, res) {
  try {
    const player = req.player;

    if (!player.gangId) {
      return res.status(404).json({ error: 'Você não pertence a nenhuma gangue' });
    }

    const gang = await Gang.findOne({ id: player.gangId });

    if (!gang) {
      return res.status(404).json({ error: 'Gangue não encontrada' });
    }

    return res.json({ gang });
  } catch (error) {
    console.error('Erro ao buscar gangue:', error);
    return res.status(500).json({ error: 'Erro ao buscar gangue' });
  }
}

export async function recruitGangMember(req, res) {
  try {
    const { method } = req.body || {};
    const player = req.player;

    if (!player.gangId) {
      return res.status(403).json({ error: 'Você não tem uma gangue' });
    }

    const gang = await Gang.findOne({ id: player.gangId });
    if (!gang) {
      return res.status(404).json({ error: 'Gangue não encontrada' });
    }

    let costDirty = 0;
    let costClean = 0;

    if (method === 'mission') costDirty = 5000;
    else if (method === 'market') costClean = 50000;
    else if (method === 'premium') costClean = 100000;
    else return res.status(400).json({ error: 'Método de recrutamento inválido' });

    if (costDirty > 0 && player.balances.dirtyMoney < costDirty) {
      return res.status(400).json({ error: 'Dinheiro sujo insuficiente' });
    }

    if (costClean > 0 && player.balances.cleanMoney < costClean) {
      return res.status(400).json({ error: 'Dinheiro limpo insuficiente' });
    }

    if (costDirty) player.balances.dirtyMoney -= costDirty;
    if (costClean) player.balances.cleanMoney -= costClean;

    const member = makeRecruit(method);
    gang.members.push(member);

    bumpVersion(player);
    await player.save();
    await gang.save();

    return res.status(201).json({ member, gang });
  } catch (error) {
    console.error('Erro ao recrutar membro:', error);
    return res.status(500).json({ error: 'Erro ao recrutar membro' });
  }
}

export async function trainGangMember(req, res) {
  try {
    const { memberId, usePremium } = req.body || {};
    const player = req.player;

    if (!player.gangId) {
      return res.status(403).json({ error: 'Você não tem uma gangue' });
    }

    const gang = await Gang.findOne({ id: player.gangId });
    if (!gang) {
      return res.status(404).json({ error: 'Gangue não encontrada' });
    }

    const member = gang.members.find((m) => m.id === memberId);
    if (!member) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    const expGain = usePremium ? 500 : 100;
    const costDirty = usePremium ? 0 : 2000;
    const costClean = usePremium ? 5000 : 0;

    if (costDirty > 0 && player.balances.dirtyMoney < costDirty) {
      return res.status(400).json({ error: 'Dinheiro sujo insuficiente' });
    }

    if (costClean > 0 && player.balances.cleanMoney < costClean) {
      return res.status(400).json({ error: 'Dinheiro limpo insuficiente' });
    }

    if (costDirty) player.balances.dirtyMoney -= costDirty;
    if (costClean) player.balances.cleanMoney -= costClean;

    member.exp += expGain;

    let leveled = false;
    while (member.exp >= member.expToNext) {
      member.exp -= member.expToNext;
      member.level += 1;
      member.expToNext = Math.floor(member.expToNext * 1.2);
      leveled = true;
    }

    if (leveled) {
      member.loyalty = Math.min(100, (member.loyalty || 0) + 5);
    }

    bumpVersion(player);
    await player.save();
    await gang.save();

    return res.json({ member, gang });
  } catch (error) {
    console.error('Erro ao treinar membro:', error);
    return res.status(500).json({ error: 'Erro ao treinar membro' });
  }
}

export async function equipGangMember(req, res) {
  try {
    const { memberId, equipmentType, itemId } = req.body || {};
    const player = req.player;

    if (!player.gangId) {
      return res.status(403).json({ error: 'Você não tem uma gangue' });
    }

    const gang = await Gang.findOne({ id: player.gangId });
    if (!gang) {
      return res.status(404).json({ error: 'Gangue não encontrada' });
    }

    const member = gang.members.find((m) => m.id === memberId);
    if (!member) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    const item = (player.inventory?.items || []).find((i) => i?.id === itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item não encontrado no inventário' });
    }

    if (!['weapon', 'armor', 'vehicle'].includes(String(equipmentType))) {
      return res.status(400).json({ error: 'Tipo de equipamento inválido' });
    }

    member.equipment[`${equipmentType}Id`] = itemId;
    await gang.save();

    return res.json({ member, gang });
  } catch (error) {
    console.error('Erro ao equipar membro:', error);
    return res.status(500).json({ error: 'Erro ao equipar membro' });
  }
}

export async function toggleActiveGangMember(req, res) {
  try {
    const { memberId, active } = req.body || {};
    const player = req.player;

    if (!player.gangId) {
      return res.status(403).json({ error: 'Você não tem uma gangue' });
    }

    const gang = await Gang.findOne({ id: player.gangId });
    if (!gang) {
      return res.status(404).json({ error: 'Gangue não encontrada' });
    }

    const member = gang.members.find((m) => m.id === memberId);
    if (!member) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    member.active = Boolean(active);

    if (member.active) {
      if (!gang.activeMemberIds.includes(memberId)) {
        gang.activeMemberIds.push(memberId);
      }
    } else {
      gang.activeMemberIds = gang.activeMemberIds.filter((id) => id !== memberId);
    }

    await gang.save();
    return res.json({ success: true, gang });
  } catch (error) {
    console.error('Erro ao alternar membro ativo:', error);
    return res.status(500).json({ error: 'Erro ao alternar membro ativo' });
  }
}

export async function dismissGangMember(req, res) {
  try {
    const { memberId } = req.body || {};
    const player = req.player;

    if (!player.gangId) {
      return res.status(403).json({ error: 'Você não tem uma gangue' });
    }

    const gang = await Gang.findOne({ id: player.gangId });
    if (!gang) {
      return res.status(404).json({ error: 'Gangue não encontrada' });
    }

    gang.members = gang.members.filter((m) => m.id !== memberId);
    gang.activeMemberIds = gang.activeMemberIds.filter((id) => id !== memberId);

    await gang.save();
    return res.json({ success: true, gang });
  } catch (error) {
    console.error('Erro ao demitir membro:', error);
    return res.status(500).json({ error: 'Erro ao demitir membro' });
  }
}

export async function donateToGang(req, res) {
  try {
    const { type, amount } = req.body || {};
    const player = req.player;

    if (!player.gangId) {
      return res.status(403).json({ error: 'Você não tem uma gangue' });
    }

    const gang = await Gang.findOne({ id: player.gangId });
    if (!gang) {
      return res.status(404).json({ error: 'Gangue não encontrada' });
    }

    const value = Number(amount || 0);
    if (value <= 0) {
      return res.status(400).json({ error: 'Valor inválido' });
    }

    let expGain = 0;

    if (type === 'dirtyMoney') {
      if (player.balances.dirtyMoney < value) {
        return res.status(400).json({ error: 'Saldo insuficiente' });
      }
      player.balances.dirtyMoney -= value;
      gang.treasury.dirtyMoney += value;
      expGain = Math.floor(value / 1000);
    } else if (type === 'cleanMoney') {
      if (player.balances.cleanMoney < value) {
        return res.status(400).json({ error: 'Saldo insuficiente' });
      }
      player.balances.cleanMoney -= value;
      gang.treasury.cleanMoney += value;
      expGain = Math.floor(value / 500);
    } else if (type === 'corre') {
      if (player.balances.corre < value) {
        return res.status(400).json({ error: 'Saldo insuficiente' });
      }
      player.balances.corre -= value;
      gang.treasury.corre += value;
      expGain = Math.floor(value / 10);
    } else {
      return res.status(400).json({ error: 'Tipo de doação inválido' });
    }

    gang.exp += expGain;

    while (gang.exp >= gang.expToNext) {
      gang.exp -= gang.expToNext;
      gang.level += 1;
      gang.expToNext = Math.floor(gang.expToNext * 1.5);
    }

    bumpVersion(player);
    await player.save();
    await gang.save();

    return res.json({ gang });
  } catch (error) {
    console.error('Erro ao doar para gangue:', error);
    return res.status(500).json({ error: 'Erro ao doar para gangue' });
  }
}

export async function upgradeGangSkill(req, res) {
  try {
    const { skillId } = req.body || {};
    const player = req.player;

    if (!player.gangId) {
      return res.status(403).json({ error: 'Você não tem uma gangue' });
    }

    const gang = await Gang.findOne({ id: player.gangId });
    if (!gang) {
      return res.status(404).json({ error: 'Gangue não encontrada' });
    }

    let cost = 0;

    if (skillId === 'training') cost = 5000;
    else if (skillId === 'hideout') cost = 8000;
    else if (skillId === 'blackmarket') cost = 10000;
    else return res.status(400).json({ error: 'Skill inválida' });

    if (gang.exp < cost) {
      return res.status(400).json({ error: 'EXP insuficiente' });
    }

    gang.exp -= cost;

    if (skillId === 'training') gang.upgrades.trainingGroundsLevel += 1;
    else if (skillId === 'hideout') gang.upgrades.hideoutLevel += 1;
    else if (skillId === 'blackmarket') gang.upgrades.blackMarketLevel += 1;

    await gang.save();
    return res.json({ gang });
  } catch (error) {
    console.error('Erro ao melhorar skill da gangue:', error);
    return res.status(500).json({ error: 'Erro ao melhorar skill da gangue' });
  }
}