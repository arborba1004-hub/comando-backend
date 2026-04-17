import mongoose from 'mongoose';
import { GRID_WIDTH, GRID_HEIGHT } from './playerDefaults.js';
import Player from '../models/Player.js';

export {
  calculatePlayerPower,
  calculateWinChance,
  calculateLoot,
} from './powerSystem.js';

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
  return {
    worldX: tileX - Math.floor(GRID_WIDTH / 2),
    worldY: tileY - Math.floor(GRID_HEIGHT / 2),
  };
}

export async function generateFreeMapPosition(maxAttempts = 300) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const tileX = Math.floor(Math.random() * GRID_WIDTH);
    const tileY = Math.floor(Math.random() * GRID_HEIGHT);

    const positionExists = await Player.findOne({
      'mapPosition.tileX': tileX,
      'mapPosition.tileY': tileY,
    }).lean();

    if (!positionExists) {
      const { worldX, worldY } = tileToWorld(tileX, tileY);
      return { tileX, tileY, worldX, worldY };
    }
  }

  return {
    tileX: Math.floor(GRID_WIDTH / 2),
    tileY: Math.floor(GRID_HEIGHT / 2),
    worldX: 0,
    worldY: 0,
  };
}