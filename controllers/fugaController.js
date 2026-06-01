import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { upsertGangStatSource } from '../services/gangStatisticsService.js';

const FUGA_BONUS_PERCENT = 1;

// Fonte autoritativa da Garagem da Fuga.
// Frontend só exibe; backend valida preço, liberação, duplicata, saldo e bônus.
const FUGA_VEHICLES = [
  { id: 'touro_negro', name: 'Touro Negro', codename: 'TN-01', unlockBarracoLevel: 1, priceCleanMoney: 450, targetType: 'frente', targetStat: 'rajada', role: 'Arrancada de intimidação' },
  { id: 'bastiao_vx', name: 'Bastião VX', codename: 'BVX', unlockBarracoLevel: 5, priceCleanMoney: 750, targetType: 'muralha', targetStat: 'blindagem', role: 'Pressão com proteção' },
  { id: 'vibora_900', name: 'Víbora 900', codename: 'V900', unlockBarracoLevel: 10, priceCleanMoney: 1100, targetType: 'assassino', targetStat: 'quebra', role: 'Corte relâmpago' },
  { id: 'mirage_gt', name: 'Mirage GT', codename: 'MGT', unlockBarracoLevel: 15, priceCleanMoney: 1600, targetType: 'certeiro', targetStat: 'rajada', role: 'Controle limpo' },
  { id: 'lastro_4x4', name: 'Lastro 4x4', codename: 'L4X', unlockBarracoLevel: 20, priceCleanMoney: 2300, targetType: 'capanga', targetStat: 'folego', role: 'Apoio pesado' },
  { id: 'silenciador_s', name: 'Silenciador S', codename: 'S-S', unlockBarracoLevel: 25, priceCleanMoney: 3200, targetType: 'executor', targetStat: 'quebra', role: 'Fuga sem sirene' },
  { id: 'dinamo_lx', name: 'Dínamo LX', codename: 'DLX', unlockBarracoLevel: 30, priceCleanMoney: 4500, targetType: 'motorista', targetStat: 'folego', role: 'Retirada prolongada' },
  { id: 'nitro_phantom', name: 'Nitro Phantom', codename: 'NPH', unlockBarracoLevel: 35, priceCleanMoney: 6300, targetType: 'nitro', targetStat: 'rajada', role: 'Segundo estágio' },
  { id: 'corvo_gt', name: 'Corvo GT', codename: 'CGT', unlockBarracoLevel: 40, priceCleanMoney: 8800, targetType: 'frente', targetStat: 'quebra', role: 'Quebra de bloqueio' },
  { id: 'sentinela_x', name: 'Sentinela X', codename: 'STX', unlockBarracoLevel: 45, priceCleanMoney: 12300, targetType: 'muralha', targetStat: 'folego', role: 'Parede de contenção' },
  { id: 'raposa_r', name: 'Raposa R', codename: 'RPR', unlockBarracoLevel: 50, priceCleanMoney: 17200, targetType: 'assassino', targetStat: 'rajada', role: 'Corte de viela' },
  { id: 'executor_van', name: 'Executor Van', codename: 'EXV', unlockBarracoLevel: 55, priceCleanMoney: 24000, targetType: 'executor', targetStat: 'blindagem', role: 'Extração fechada' },
  { id: 'gigante_6x6', name: 'Gigante 6x6', codename: 'G6X', unlockBarracoLevel: 60, priceCleanMoney: 33000, targetType: 'motorista', targetStat: 'blindagem', role: 'Rota impossível' },
  { id: 'obus_mk', name: 'Obus MK', codename: 'OBM', unlockBarracoLevel: 65, priceCleanMoney: 45500, targetType: 'muralha', targetStat: 'quebra', role: 'Choque pesado' },
  { id: 'fantasma_sedan', name: 'Fantasma Sedan', codename: 'FSD', unlockBarracoLevel: 70, priceCleanMoney: 62000, targetType: 'certeiro', targetStat: 'blindagem', role: 'Infiltração premium' },
  { id: 'cobra_negra', name: 'Cobra Negra', codename: 'CBN', unlockBarracoLevel: 75, priceCleanMoney: 84000, targetType: 'assassino', targetStat: 'folego', role: 'Fôlego de perseguição' },
  { id: 'falcao_4x4', name: 'Falcão 4x4', codename: 'F4X', unlockBarracoLevel: 80, priceCleanMoney: 112000, targetType: 'capanga', targetStat: 'blindagem', role: 'Apoio fora de rota' },
  { id: 'tempestade_gt', name: 'Tempestade GT', codename: 'TPG', unlockBarracoLevel: 85, priceCleanMoney: 150000, targetType: 'nitro', targetStat: 'folego', role: 'Velocidade sustentada' },
  { id: 'imperador_lux', name: 'Imperador Lux', codename: 'ILX', unlockBarracoLevel: 90, priceCleanMoney: 200000, targetType: 'executor', targetStat: 'folego', role: 'Comando discreto' },
  { id: 'eclipse_zero', name: 'Eclipse Zero', codename: 'EZ0', unlockBarracoLevel: 95, priceCleanMoney: 265000, targetType: 'nitro', targetStat: 'quebra', role: 'Fim de jogo' },
];

const LEGACY_NAME_TO_ID = new Map(FUGA_VEHICLES.map((vehicle) => [vehicle.name.toLowerCase(), vehicle.id]));

function findVehicle(input = {}) {
  const rawId = String(input.vehicleId || input.id || input.itemId || '').trim();
  if (rawId) {
    const direct = FUGA_VEHICLES.find((vehicle) => vehicle.id === rawId || `fuga:${vehicle.id}` === rawId);
    if (direct) return direct;
  }

  const rawName = String(input.name || '').trim().toLowerCase();
  if (rawName && LEGACY_NAME_TO_ID.has(rawName)) {
    return FUGA_VEHICLES.find((vehicle) => vehicle.id === LEGACY_NAME_TO_ID.get(rawName)) || null;
  }

  return null;
}

function ensureInventory(player) {
  if (!player.inventory || typeof player.inventory !== 'object') {
    player.inventory = { items: [], gifts: [], rewards: [] };
  }
  if (!Array.isArray(player.inventory.items)) player.inventory.items = [];
  if (!Array.isArray(player.inventory.gifts)) player.inventory.gifts = [];
  if (!Array.isArray(player.inventory.rewards)) player.inventory.rewards = [];
}

function ensureGang(player) {
  if (!player.gang || typeof player.gang !== 'object') {
    player.gang = { members: [], trainingSlots: [], stats: {}, statSources: [], statSnapshot: null };
  }
  if (!Array.isArray(player.gang.members)) player.gang.members = [];
  if (!Array.isArray(player.gang.trainingSlots)) player.gang.trainingSlots = [];
  if (!Array.isArray(player.gang.statSources)) player.gang.statSources = [];
}

function statPercent(stat, value = FUGA_BONUS_PERCENT) {
  return {
    rajada: stat === 'rajada' ? value : 0,
    blindagem: stat === 'blindagem' ? value : 0,
    folego: stat === 'folego' ? value : 0,
    quebra: stat === 'quebra' ? value : 0,
  };
}

function isOwned(player, vehicle) {
  const ownedVehicles = Array.isArray(player.ownedVehicles) ? player.ownedVehicles.map(String) : [];
  if (ownedVehicles.includes(vehicle.id)) return true;

  const items = Array.isArray(player?.inventory?.items) ? player.inventory.items : [];
  return items.some((item) => item?.id === `fuga:${vehicle.id}` || item?.vehicleId === vehicle.id);
}

function buildInventoryItem(vehicle) {
  return {
    id: `fuga:${vehicle.id}`,
    vehicleId: vehicle.id,
    name: vehicle.name,
    codename: vehicle.codename,
    category: 'fuga_vehicle',
    source: 'fuga',
    rarity: vehicle.unlockBarracoLevel >= 90 ? 'legendary' : vehicle.unlockBarracoLevel >= 60 ? 'phantom' : 'signature',
    role: vehicle.role,
    level: vehicle.unlockBarracoLevel,
    price: vehicle.priceCleanMoney,
    currency: 'cleanMoney',
    targetType: vehicle.targetType,
    targetStat: vehicle.targetStat,
    bonusPercent: FUGA_BONUS_PERCENT,
    purchasedAt: new Date().toISOString(),
  };
}

function buildStatSource(vehicle) {
  return {
    id: `fuga:${vehicle.id}:stat`,
    source: 'item',
    label: `Garagem da Fuga - ${vehicle.name}`,
    targetScope: 'type',
    targetType: vehicle.targetType,
    targetMemberId: null,
    percent: statPercent(vehicle.targetStat),
    flat: { rajada: 0, blindagem: 0, folego: 0, quebra: 0 },
    enabled: true,
    expiresAt: null,
    updatedAtIso: new Date().toISOString(),
  };
}

export async function buyFugaVehicle(req, res) {
  try {
    const player = req.player;
    const vehicle = findVehicle(req.body || {});

    if (!vehicle) {
      return res.status(400).json({ error: 'Veículo de fuga inválido' });
    }

    const barracoLevel = Math.max(1, Math.floor(Number(player?.niveis?.barracoLevel || 1)));
    if (barracoLevel < vehicle.unlockBarracoLevel) {
      return res.status(403).json({ error: `Esse veículo libera no barraco nível ${vehicle.unlockBarracoLevel}` });
    }

    if (player?.punishments?.cleanMoneyBlocked) {
      return res.status(403).json({ error: 'Dinheiro limpo bloqueado por punição ativa' });
    }

    ensureInventory(player);
    ensureGang(player);
    if (!Array.isArray(player.ownedVehicles)) player.ownedVehicles = [];

    if (isOwned(player, vehicle)) {
      return res.status(409).json({ error: 'Esse veículo já está na sua frota' });
    }

    const price = Number(vehicle.priceCleanMoney || 0);
    if (Number(player?.balances?.cleanMoney || 0) < price) {
      return res.status(400).json({ error: 'Dinheiro limpo insuficiente' });
    }

    player.balances.cleanMoney = Number((Number(player.balances.cleanMoney || 0) - price).toFixed(2));
    player.ownedVehicles.push(vehicle.id);

    const item = buildInventoryItem(vehicle);
    player.inventory.items.push(item);

    // IMPORTANTE PARA A BATALHA:
    // services/attack/resolveAttack.js consome player.gang.statSources com
    // buildMemberStatSnapshot/buildGangStatSnapshot antes de calcular rounds.
    // Por isso cada veículo grava uma fonte permanente em gang.statSources.
    const { source: statSource, statSnapshot } = upsertGangStatSource(player, buildStatSource(vehicle));

    if (!player.pageLevels || typeof player.pageLevels !== 'object') player.pageLevels = {};
    player.pageLevels.fuga = Math.max(Number(player.pageLevels.fuga || 1), player.ownedVehicles.length || 1);

    if (typeof player.markModified === 'function') {
      player.markModified('balances');
      player.markModified('ownedVehicles');
      player.markModified('inventory');
      player.markModified('pageLevels');
      player.markModified('gang');
    }

    bumpVersion(player);
    await player.save();

    const mappedPlayer = mergePlayerState(player.toObject());
    emitToPlayer(String(player._id), 'playerUpdate', { player: mappedPlayer });

    return res.json({
      player: mappedPlayer,
      vehicle,
      item,
      statSource,
      statSnapshot,
      message: `${vehicle.name} comprado com sucesso`,
    });
  } catch (error) {
    console.error('Erro ao comprar veículo de fuga:', error);
    return res.status(500).json({ error: 'Erro ao comprar veículo de fuga' });
  }
}

// Compatibilidade com bundles antigos. A nova Garagem da Fuga usa /fuga/buy.
export async function buyFugaCatalogAccessory(_req, res) {
  return res.status(410).json({
    error: 'Sistema antigo de acessórios de fuga substituído pela Garagem da Fuga. Use /fuga/buy.',
  });
}

export async function buyFugaVehicleUpgrade(_req, res) {
  return res.status(410).json({
    error: 'Sistema antigo de upgrades de fuga substituído pela Garagem da Fuga. Use /fuga/buy.',
  });
}
