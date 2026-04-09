import mongoose from 'mongoose';
import { GRID_WIDTH, GRID_HEIGHT } from './playerDefaults.js';
import Player from '../models/Player.js';

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

export function calculatePlayerPower(player) {
  const skills = player.skills || {};
  const attack = (skills.attack || 0) * 1.4;
  const defense = (skills.defense || 0) * 1.2;
  const intelligence = (skills.intelligence || 0) * 1.1;
  const agility = (skills.agility || 0) * 1.15;
  const respect = (skills.respect || 0) * 0.9;
  const vigor = (skills.vigor || 0) * 1.25;

  return Math.floor(attack + defense + intelligence + agility + respect + vigor);
}

export function calculateWinChance(attackerPower, defenderPower) {
  const denom = Math.max(1, attackerPower + defenderPower);
  const chance = attackerPower / denom;
  return Math.min(0.9, Math.max(0.3, chance));
}

export function getLootCapByLevel(level) {
  if (level <= 9) return 20000;
  if (level <= 19) return 50000;
  if (level <= 29) return 120000;
  if (level <= 39) return 300000;
  if (level <= 49) return 700000;
  if (level <= 59) return 1500000;
  if (level <= 69) return 3000000;
  if (level <= 79) return 6000000;
  if (level <= 89) return 10000000;
  return 20000000;
}

export function calculateLoot(defenderDirtyMoney, defenderLevel, isCritical) {
  const exposed = defenderDirtyMoney * 0.4;
  const percent = isCritical ? 0.25 : 0.15;
  const loot = Math.floor(exposed * percent);
  const cap = getLootCapByLevel(defenderLevel);

  return Math.min(loot, cap);
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