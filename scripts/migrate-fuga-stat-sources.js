import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Player from '../models/Player.js';
import { upsertGangStatSource } from '../services/gangStatisticsService.js';

const FUGA_BONUS_PERCENT = 1;

const FUGA_VEHICLES = [
  { id: 'touro_negro', tier: 'rua', name: 'Touro Negro', codename: 'TN-01', unlockBarracoLevel: 1, priceCleanMoney: 450, targetType: 'frente', targetStat: 'rajada', role: 'Arrancada de intimidação' },
  { id: 'bastiao_vx', tier: 'blindado', name: 'Bastião VX', codename: 'BVX', unlockBarracoLevel: 5, priceCleanMoney: 750, targetType: 'muralha', targetStat: 'blindagem', role: 'Pressão com proteção' },
  { id: 'vibora_900', tier: 'pro', name: 'Víbora 900', codename: 'V900', unlockBarracoLevel: 10, priceCleanMoney: 1100, targetType: 'assassino', targetStat: 'quebra', role: 'Corte relâmpago' },
  { id: 'mirage_gt', tier: 'pro', name: 'Mirage GT', codename: 'MGT', unlockBarracoLevel: 15, priceCleanMoney: 1600, targetType: 'certeiro', targetStat: 'rajada', role: 'Controle limpo' },
  { id: 'lastro_4x4', tier: 'blindado', name: 'Lastro 4x4', codename: 'L4X', unlockBarracoLevel: 20, priceCleanMoney: 2300, targetType: 'capanga', targetStat: 'folego', role: 'Apoio pesado' },
  { id: 'silenciador_s', tier: 'elite', name: 'Silenciador S', codename: 'S-S', unlockBarracoLevel: 25, priceCleanMoney: 3200, targetType: 'executor', targetStat: 'quebra', role: 'Fuga sem sirene' },
  { id: 'dinamo_lx', tier: 'phantom', name: 'Dínamo LX', codename: 'DLX', unlockBarracoLevel: 30, priceCleanMoney: 4500, targetType: 'motorista', targetStat: 'folego', role: 'Retirada prolongada' },
  { id: 'nitro_phantom', tier: 'phantom', name: 'Nitro Phantom', codename: 'NPH', unlockBarracoLevel: 35, priceCleanMoney: 6300, targetType: 'nitro', targetStat: 'rajada', role: 'Segundo estágio' },
  { id: 'corvo_gt', tier: 'elite', name: 'Corvo GT', codename: 'CGT', unlockBarracoLevel: 40, priceCleanMoney: 8800, targetType: 'frente', targetStat: 'quebra', role: 'Quebra de bloqueio' },
  { id: 'sentinela_x', tier: 'blindado', name: 'Sentinela X', codename: 'STX', unlockBarracoLevel: 45, priceCleanMoney: 12300, targetType: 'muralha', targetStat: 'folego', role: 'Parede de contenção' },
  { id: 'raposa_r', tier: 'pro', name: 'Raposa R', codename: 'RPR', unlockBarracoLevel: 50, priceCleanMoney: 17200, targetType: 'assassino', targetStat: 'rajada', role: 'Corte de viela' },
  { id: 'executor_van', tier: 'blindado', name: 'Executor Van', codename: 'EXV', unlockBarracoLevel: 55, priceCleanMoney: 24000, targetType: 'executor', targetStat: 'blindagem', role: 'Extração fechada' },
  { id: 'gigante_6x6', tier: 'phantom', name: 'Gigante 6x6', codename: 'G6X', unlockBarracoLevel: 60, priceCleanMoney: 33000, targetType: 'motorista', targetStat: 'blindagem', role: 'Rota impossível' },
  { id: 'obus_mk', tier: 'phantom', name: 'Ôbus MK', codename: 'OBM', unlockBarracoLevel: 65, priceCleanMoney: 45500, targetType: 'muralha', targetStat: 'quebra', role: 'Choque pesado' },
  { id: 'fantasma_sedan', tier: 'elite', name: 'Fantasma Sedan', codename: 'FSD', unlockBarracoLevel: 70, priceCleanMoney: 62000, targetType: 'certeiro', targetStat: 'blindagem', role: 'Infiltração premium' },
  { id: 'cobra_negra', tier: 'elite', name: 'Cobra Negra', codename: 'CBN', unlockBarracoLevel: 75, priceCleanMoney: 84000, targetType: 'assassino', targetStat: 'folego', role: 'Fôlego de perseguição' },
  { id: 'falcao_4x4', tier: 'blindado', name: 'Falcão 4x4', codename: 'F4X', unlockBarracoLevel: 80, priceCleanMoney: 112000, targetType: 'capanga', targetStat: 'blindagem', role: 'Apoio fora de rota' },
  { id: 'tempestade_gt', tier: 'phantom', name: 'Tempestade GT', codename: 'TPG', unlockBarracoLevel: 85, priceCleanMoney: 150000, targetType: 'nitro', targetStat: 'folego', role: 'Velocidade sustentada' },
  { id: 'imperador_lux', tier: 'lendario', name: 'Imperador Lux', codename: 'ILX', unlockBarracoLevel: 90, priceCleanMoney: 200000, targetType: 'executor', targetStat: 'folego', role: 'Comando discreto' },
  { id: 'eclipse_zero', tier: 'lendario', name: 'Eclipse Zero', codename: 'EZ0', unlockBarracoLevel: 95, priceCleanMoney: 265000, targetType: 'nitro', targetStat: 'quebra', role: 'Fim de jogo' },
];

const vehicleById = new Map(FUGA_VEHICLES.map((vehicle) => [vehicle.id, vehicle]));

function statPercent(stat, value = FUGA_BONUS_PERCENT) {
  return {
    rajada: stat === 'rajada' ? value : 0,
    blindagem: stat === 'blindagem' ? value : 0,
    folego: stat === 'folego' ? value : 0,
    quebra: stat === 'quebra' ? value : 0,
  };
}

function buildInventoryItem(vehicle) {
  return {
    id: `fuga:${vehicle.id}`,
    vehicleId: vehicle.id,
    name: vehicle.name,
    codename: vehicle.codename,
    category: 'fuga_vehicle',
    source: 'fuga',
    tier: vehicle.tier,
    rarity: vehicle.tier,
    role: vehicle.role,
    level: vehicle.unlockBarracoLevel,
    price: vehicle.priceCleanMoney,
    currency: 'cleanMoney',
    targetType: vehicle.targetType,
    targetStat: vehicle.targetStat,
    bonusPercent: FUGA_BONUS_PERCENT,
    purchasedAt: new Date().toISOString(),
    migratedAt: new Date().toISOString(),
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

function normalizeOwnedVehicleIds(player) {
  const fromOwned = Array.isArray(player?.ownedVehicles) ? player.ownedVehicles.map(String) : [];
  const fromInventory = Array.isArray(player?.inventory?.items)
    ? player.inventory.items
        .filter((item) => item?.source === 'fuga' || item?.category === 'fuga_vehicle' || item?.vehicleId)
        .map((item) => String(item?.vehicleId || '').trim())
        .filter(Boolean)
    : [];

  return Array.from(new Set([...fromOwned, ...fromInventory].filter((id) => vehicleById.has(id))));
}

function getMaxUnlock(ownedIds) {
  return ownedIds.reduce((max, vehicleId) => Math.max(max, Number(vehicleById.get(vehicleId)?.unlockBarracoLevel || 1)), 1);
}

async function main() {
  await connectDB();

  const cursor = Player.find({
    $or: [
      { ownedVehicles: { $exists: true, $ne: [] } },
      { 'inventory.items.category': 'fuga_vehicle' },
      { 'inventory.items.source': 'fuga' },
    ],
  }).cursor();

  let checked = 0;
  let updated = 0;

  for await (const player of cursor) {
    checked += 1;

    if (!player.inventory || typeof player.inventory !== 'object') player.inventory = { items: [], gifts: [], rewards: [] };
    if (!Array.isArray(player.inventory.items)) player.inventory.items = [];
    if (!player.gang || typeof player.gang !== 'object') player.gang = { members: [], trainingSlots: [], stats: {}, statSources: [], statSnapshot: null };
    if (!Array.isArray(player.gang.statSources)) player.gang.statSources = [];

    const ownedIds = normalizeOwnedVehicleIds(player);
    if (ownedIds.length === 0) continue;

    const existingItemIds = new Set(player.inventory.items.map((item) => String(item?.id || '')));
    for (const vehicleId of ownedIds) {
      const vehicle = vehicleById.get(vehicleId);
      if (!vehicle) continue;

      const itemId = `fuga:${vehicle.id}`;
      if (!existingItemIds.has(itemId)) {
        player.inventory.items.push(buildInventoryItem(vehicle));
        existingItemIds.add(itemId);
      }

      upsertGangStatSource(player, buildStatSource(vehicle));
    }

    player.ownedVehicles = ownedIds;
    if (!player.pageLevels || typeof player.pageLevels !== 'object') player.pageLevels = {};
    player.pageLevels.fuga = Math.max(1, ownedIds.length);
    player.fugaMaxUnlockBarracoLevel = getMaxUnlock(ownedIds);

    player.markModified('ownedVehicles');
    player.markModified('inventory');
    player.markModified('pageLevels');
    player.markModified('gang');

    await player.save();
    updated += 1;
  }

  console.log(`[FUGA_MIGRATION] Jogadores verificados: ${checked}`);
  console.log(`[FUGA_MIGRATION] Jogadores corrigidos: ${updated}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('[FUGA_MIGRATION] Falha na migração:', error);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
