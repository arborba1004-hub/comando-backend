import mongoose from 'mongoose';
import { ECONOMY } from '../config/economyConfig.js';
import { GRID_WIDTH, GRID_HEIGHT } from './playerDefaults.js';
import Player from '../models/Player.js';
import {
  calculatePlayerPower,
  calculateWinChance,
  calculateLoot,
} from './powerSystem.js';

export {
  calculatePlayerPower,
  calculateWinChance,
  calculateLoot,
};

export const LOT_SIZE = 8;

function snapTileToLotOrigin(tile, maxTiles) {
  const numericTile = Number.isFinite(Number(tile)) ? Math.floor(Number(tile)) : 0;
  const snapped = Math.floor(numericTile / LOT_SIZE) * LOT_SIZE;
  return Math.max(0, Math.min(maxTiles - LOT_SIZE, snapped));
}

export function generateId() {
  return new mongoose.Types.ObjectId().toString();
}

export function bumpVersion(player) {
  player.version = (player.version || 0) + 1;
}

export function applyPassiveIncome(player) {
  // Economia oficial: Corre = atividade criminosa/energia do Giro.
  // Regenera automaticamente apenas até o soft cap. Corres ganhos por facção,
  // eventos, calendário e loja podem passar do cap sem serem removidos.
  const now = Date.now();
  const last = Number(player.lastPassiveIncomeAt || now);
  const currentCorre = Math.max(0, Number(player.balances?.corre || 0));
  const softCap = ECONOMY.CORRE.regenSoftCap;

  if (!player.balances) player.balances = {};

  if (currentCorre >= softCap) {
    player.lastPassiveIncomeAt = now;
    return;
  }

  const intervalMs = Math.floor(60 * 60 * 1000 / ECONOMY.CORRE.regenPerHour);
  const earned = Math.floor((now - last) / intervalMs);

  if (earned <= 0) return;

  player.balances.corre = Math.min(softCap, currentCorre + earned);
  player.lastPassiveIncomeAt = last + earned * intervalMs;

  if (player.balances.corre >= softCap) {
    player.lastPassiveIncomeAt = now;
  }
}

export function tileToWorld(tileX, tileY) {
  const snappedTileX = snapTileToLotOrigin(tileX, GRID_WIDTH);
  const snappedTileY = snapTileToLotOrigin(tileY, GRID_HEIGHT);

  return {
    worldX: snappedTileX - Math.floor(GRID_WIDTH / 2) + LOT_SIZE / 2,
    worldY: snappedTileY - Math.floor(GRID_HEIGHT / 2) + LOT_SIZE / 2,
  };
}

export async function generateFreeMapPosition(maxAttempts = 300) {
  const lotsX = Math.floor(GRID_WIDTH / LOT_SIZE);
  const lotsY = Math.floor(GRID_HEIGHT / LOT_SIZE);

  for (let i = 0; i < maxAttempts; i += 1) {
    const tileX = Math.floor(Math.random() * lotsX) * LOT_SIZE;
    const tileY = Math.floor(Math.random() * lotsY) * LOT_SIZE;

    const positionExists = await Player.findOne({
      'mapPosition.tileX': tileX,
      'mapPosition.tileY': tileY,
    }).lean();

    if (!positionExists) {
      const { worldX, worldY } = tileToWorld(tileX, tileY);
      return { tileX, tileY, worldX, worldY };
    }
  }

  const fallbackTileX = Math.floor(Math.floor(GRID_WIDTH / 2) / LOT_SIZE) * LOT_SIZE;
  const fallbackTileY = Math.floor(Math.floor(GRID_HEIGHT / 2) / LOT_SIZE) * LOT_SIZE;
  const { worldX, worldY } = tileToWorld(fallbackTileX, fallbackTileY);

  return {
    tileX: fallbackTileX,
    tileY: fallbackTileY,
    worldX,
    worldY,
  };
}