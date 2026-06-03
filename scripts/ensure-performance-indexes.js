import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import Player from '../models/Player.js';
import Faction from '../models/Faction.js';
import AzideiaTarget from '../models/AzideiaTarget.js';
import AzideiaMission from '../models/AzideiaMission.js';
import AzideiaRewardBatch from '../models/AzideiaRewardBatch.js';
import ChatMessage from '../models/ChatMessage.js';
import QgEvent from '../models/QgEvent.js';

const models = [
  Player,
  Faction,
  AzideiaTarget,
  AzideiaMission,
  AzideiaRewardBatch,
  ChatMessage,
  QgEvent,
];

async function main() {
  await connectDB();

  for (const model of models) {
    console.log(`🔎 Garantindo índices: ${model.modelName}`);
    await model.createIndexes();
    console.log(`✅ Índices ok: ${model.modelName}`);
  }

  await mongoose.disconnect();
  console.log('✅ Índices de performance criados/confirmados.');
}

main().catch(async (error) => {
  console.error('❌ Falha ao criar índices de performance:', error);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
