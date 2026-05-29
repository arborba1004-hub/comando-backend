import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri =
  process.env.MONGO_URI ||
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL;

if (!mongoUri) {
  console.error('[AZIDEIA_MIGRATION] Defina MONGO_URI, MONGODB_URI ou DATABASE_URL no ambiente.');
  process.exit(1);
}

function asObjectIdOrString(value) {
  const safe = String(value || '').trim();
  if (!safe) return null;
  return mongoose.Types.ObjectId.isValid(safe) ? new mongoose.Types.ObjectId(safe) : safe;
}

async function migrateCorreriaDailyField(db) {
  // Corrige documentos como o print: azideiaDaily.correriaFactionCorreceive.
  // Usa pipeline para preservar o maior valor quando o campo correto também já existe.
  const result = await db.collection('players').updateMany(
    { 'azideiaDaily.correriaFactionCorreceive': { $exists: true } },
    [
      {
        $set: {
          'azideiaDaily.correriaFactionCorreReceived': {
            $max: [
              { $ifNull: ['$azideiaDaily.correriaFactionCorreReceived', 0] },
              { $ifNull: ['$azideiaDaily.correriaFactionCorreceive', 0] },
            ],
          },
        },
      },
      { $unset: 'azideiaDaily.correriaFactionCorreceive' },
    ],
  );

  console.log('[AZIDEIA_MIGRATION] Campo correriaFactionCorreceive normalizado:', {
    matched: result.matchedCount,
    modified: result.modifiedCount,
  });
}

async function normalizeFactionIds(db) {
  const factions = await db.collection('factions')
    .find({}, { projection: { _id: 1, id: 1, members: 1 } })
    .toArray();
  let updated = 0;

  for (const faction of factions) {
    const canonicalFactionId = String(faction.id || '').trim();
    if (!canonicalFactionId || !Array.isArray(faction.members)) continue;

    const memberIds = faction.members
      .map((member) => String(member?.playerId || '').trim())
      .filter(Boolean);

    for (const playerId of memberIds) {
      const rawId = asObjectIdOrString(playerId);
      if (!rawId) continue;

      const result = await db.collection('players').updateOne(
        {
          _id: rawId,
          $or: [
            { factionId: { $exists: false } },
            { factionId: null },
            { factionId: '' },
            { factionId: { $ne: canonicalFactionId } },
          ],
        },
        { $set: { factionId: canonicalFactionId } },
      );
      updated += result.modifiedCount || 0;
    }
  }

  console.log('[AZIDEIA_MIGRATION] Player.factionId normalizado por members.playerId:', { updated });
}

async function main() {
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  await migrateCorreriaDailyField(db);
  await normalizeFactionIds(db);

  await mongoose.disconnect();
  console.log('[AZIDEIA_MIGRATION] Concluída.');
}

main().catch(async (error) => {
  console.error('[AZIDEIA_MIGRATION_ERROR]', error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
