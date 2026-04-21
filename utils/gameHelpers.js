import mongoose from 'mongoose';
import { GRID_WIDTH, GRID_HEIGHT } from './playerDefaults.js';
import Player from '../models/Player.js';

export {
  calculatePlayerPower,
  calculateWinChance,
  calculateLoot,
} from './powerSystem.js';

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
  const now = Date.now();
  const last = player.lastPassiveIncomeAt || now;
  const minutesPassed = Math.floor((now - last) / 60000);

  if (minutesPassed <= 0) return;

  const level = player.niveis?.playerLevel || 1;
  const ganho = minutesPassed * level;

  player.balances.corre += ganho;
  player.lastPassiveIncomeAt = now;
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

  const fallbackTileX = Math.floor((Math.floor(GRID_WIDTH / 2)) / LOT_SIZE) * LOT_SIZE;
  const fallbackTileY = Math.floor((Math.floor(GRID_HEIGHT / 2)) / LOT_SIZE) * LOT_SIZE;
  const { worldX, worldY } = tileToWorld(fallbackTileX, fallbackTileY);

  return {
    tileX: fallbackTileX,
    tileY: fallbackTileY,
    worldX,
    worldY,
  };
}