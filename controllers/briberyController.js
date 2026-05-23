import { mergePlayerState } from '../utils/playerMapper.js';
import { bumpVersion } from '../utils/gameHelpers.js';
import { emitToPlayer } from '../services/socketEmitter.js';
import { buildGangStatSnapshot } from '../services/gangStatisticsService.js';

const MAX_BRIBERY_LEVEL = 100;
const SUBORNO_TARGET_ROTATION = ['assassino', 'certeiro', 'muralha', 'frente'];
const SUBORNO_SOURCE_PREFIX = 'suborno_blindagem_';

function addHours(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function toSafeLevel(value, fallback = 1) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(MAX_BRIBERY_LEVEL, numeric));
}

function calculateSubornoValue(level) {
  const safeLevel = toSafeLevel(level, 1);
  return Math.floor(220 * Math.pow(1.1, safeLevel - 1));
}

function getNextSubornoTarget(currentBriberyLevel) {
  const safeLevel = toSafeLevel(currentBriberyLevel, 1);
  return SUBORNO_TARGET_ROTATION[(safeLevel - 1) % SUBORNO_TARGET_ROTATION.length];
}

function createEmptyStats() {
  return { rajada: 0, blindagem: 0, folego: 0, quebra: 0 };
}

function countSubornoBonusesByType(briberyLevel) {
  const paidBribes = Math.max(0, toSafeLevel(briberyLevel, 1) - 1);
  const counts = SUBORNO_TARGET_ROTATION.reduce((acc, type) => {
    acc[type] = 0;
    return acc;
  }, {});

  for (let index = 0; index < paidBribes; index += 1) {
    const targetType = SUBORNO_TARGET_ROTATION[index % SUBORNO_TARGET_ROTATION.length];
    counts[targetType] += 1;
  }

  return counts;
}

function rebuildSubornoBlindagemSources(player, briberyLevel) {
  player.gang = player.gang || { members: [], trainingSlots: [], stats: {}, statSources: [] };

  const existingSources = Array.isArray(player.gang.statSources) ? player.gang.statSources : [];
  const preservedSources = existingSources.filter(
    (source) => !String(source?.id || '').startsWith(SUBORNO_SOURCE_PREFIX)
  );
  const counts = countSubornoBonusesByType(briberyLevel);
  const nowIso = new Date().toISOString();

  const subornoSources = SUBORNO_TARGET_ROTATION
    .filter((targetType) => counts[targetType] > 0)
    .map((targetType) => ({
      id: `${SUBORNO_SOURCE_PREFIX}${targetType}`,
      source: 'suborno',
      label: `Suborno — Blindagem de ${targetType}`,
      targetScope: 'type',
      targetType,
      targetMemberId: null,
      percent: { ...createEmptyStats(), blindagem: counts[targetType] },
      flat: createEmptyStats(),
      enabled: true,
      expiresAt: null,
      updatedAtIso: nowIso,
    }));

  player.gang.statSources = [...preservedSources, ...subornoSources];
  player.gang.statSnapshot = buildGangStatSnapshot(player.gang.members || [], player.gang.statSources);
  player.gang.updatedAtIso = nowIso;

  if (typeof player.markModified === 'function') player.markModified('gang');

  return {
    statSources: player.gang.statSources,
    statSnapshot: player.gang.statSnapshot,
  };
}

export async function bribe(req, res) {
  try {
    const player = req.player;
    player.niveis = player.niveis || {};
    player.pageLevels = player.pageLevels || {};
    player.balances = player.balances || {};

    const barracoLevel = toSafeLevel(player?.niveis?.barracoLevel, 1);
    const currentBriberyLevel = toSafeLevel(
      Math.max(
        Number(player?.niveis?.briberyLevel || 1),
        Number(player?.pageLevels?.bribery || 1)
      ),
      1
    );

    if (currentBriberyLevel >= MAX_BRIBERY_LEVEL) {
      return res.status(400).json({ error: 'Suborno já está no nível máximo.' });
    }

    if (currentBriberyLevel >= barracoLevel) {
      return res.status(400).json({
        error: `Evolua o barraco para liberar o suborno nível ${currentBriberyLevel + 1}.`,
        briberyLevel: currentBriberyLevel,
        barracoLevel,
      });
    }

    const amount = calculateSubornoValue(currentBriberyLevel);

    if ((player.balances?.dirtyMoney || 0) < amount) {
      return res.status(400).json({ error: 'Dinheiro sujo insuficiente' });
    }

    const nextBriberyLevel = Math.min(MAX_BRIBERY_LEVEL, currentBriberyLevel + 1);
    const targetType = getNextSubornoTarget(currentBriberyLevel);

    player.balances.dirtyMoney = Math.max(0, Number(player.balances?.dirtyMoney || 0) - amount);
    player.niveis.briberyLevel = nextBriberyLevel;
    player.pageLevels.bribery = Math.max(Number(player.pageLevels?.bribery || 1), nextBriberyLevel);

    const { statSources, statSnapshot } = rebuildSubornoBlindagemSources(player, nextBriberyLevel);

    bumpVersion(player);
    await player.save();

    const playerPayload = mergePlayerState(player.toObject());
    emitToPlayer(String(player._id), 'playerUpdate', { player: playerPayload });

    return res.json({
      player: playerPayload,
      suborno: {
        previousLevel: currentBriberyLevel,
        briberyLevel: nextBriberyLevel,
        barracoLevel,
        cost: amount,
        targetType,
        stat: 'blindagem',
        bonusPercent: 1,
        nextCost: nextBriberyLevel < barracoLevel ? calculateSubornoValue(nextBriberyLevel) : null,
        statSources,
        statSnapshot,
      },
    });
  } catch (error) {
    console.error('Erro em bribe:', error);
    return res.status(500).json({ error: 'Erro no suborno' });
  }
}

export async function delacao(req, res) {
  try {
    const player = req.player;

    const expiresAt = addHours(72);

    player.punishments.delacao = {
      active: true,
      expiresAt,
    };

    player.punishments.inventoryBlocked = true;
    player.punishments.dirtyMoneyBlocked = true;
    player.punishments.cleanMoneyBlocked = true;
    player.punishments.levelProgressionBlocked = true;
    player.punishments.inventoryBonusReductionPercent = 100;
    player.punishments.pvpProtectionUntil = expiresAt;
    player.punishments.delacaoRewardPending = true;
    player.punishments.delacaoRewardUnlockAt = expiresAt;
    player.punishments.pendingSkillBoost = 100;

    player.skillBoostMultiplier = 2.0;

    bumpVersion(player);
    await player.save();
    emitToPlayer(String(player._id), 'playerUpdate', { player: mergePlayerState(player.toObject()) });

    return res.json({
      player: mergePlayerState(player.toObject()),
    });
  } catch (error) {
    console.error('Erro em delacao:', error);
    return res.status(500).json({ error: 'Erro na delação' });
  }
}
