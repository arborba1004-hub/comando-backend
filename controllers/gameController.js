import { mergePlayerState } from '../utils/playerMapper.js';
import { applyPassiveIncome, bumpVersion } from '../utils/gameHelpers.js';

const ALLOWED_MULTIPLIERS = [1, 2, 5, 10, 25, 50];

function randomFrom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function resolveSlotSpin() {
  const pool = ['money', 'money', 'money', 'gun', 'gun', 'diamond', 'police'];
  const reels = [randomFrom(pool), randomFrom(pool), randomFrom(pool)];

  const counts = reels.reduce((acc, symbol) => {
    acc[symbol] = (acc[symbol] || 0) + 1;
    return acc;
  }, {});

  const triple = Object.entries(counts).find(([, qty]) => qty === 3)?.[0] || null;
  const double = Object.entries(counts).find(([, qty]) => qty === 2)?.[0] || null;

  if (triple === 'police') {
    return {
      reels,
      dirtyGain: 0,
      prison: true,
      doublePolice: false,
      label: 'RODOU',
    };
  }

  if (triple === 'diamond') {
    return {
      reels,
      dirtyGain: 10000,
      prison: false,
      doublePolice: false,
      label: 'JACKPOT',
    };
  }

  if (triple === 'money') {
    return {
      reels,
      dirtyGain: 2500,
      prison: false,
      doublePolice: false,
      label: 'TRIPLO MONEY',
    };
  }

  if (triple === 'gun') {
    return {
      reels,
      dirtyGain: 1600,
      prison: false,
      doublePolice: false,
      label: 'TRIPLO ARSENAL',
    };
  }

  if (double === 'police') {
    return {
      reels,
      dirtyGain: 0,
      prison: false,
      doublePolice: true,
      label: 'BLITZ',
    };
  }

  if (double === 'diamond') {
    return {
      reels,
      dirtyGain: 1200,
      prison: false,
      doublePolice: false,
      label: 'DUPLO DIAMANTE',
    };
  }

  if (double === 'money') {
    return {
      reels,
      dirtyGain: 600,
      prison: false,
      doublePolice: false,
      label: 'DUPLO MONEY',
    };
  }

  if (double === 'gun') {
    return {
      reels,
      dirtyGain: 450,
      prison: false,
      doublePolice: false,
      label: 'DUPLO ARSENAL',
    };
  }

  return {
    reels,
    dirtyGain: 120,
    prison: false,
    doublePolice: false,
    label: 'CORRE DE RUA',
  };
}

export async function gameAction(req, res) {
  try {
    const player = req.player;
    const { action, data } = req.body || {};

    if (!action) {
      return res.status(400).json({ error: 'Ação ausente' });
    }

    applyPassiveIncome(player);

    if (action === 'spin_slot') {
      const multiplier = Number(data?.multiplier || 1);

      if (!ALLOWED_MULTIPLIERS.includes(multiplier)) {
        return res.status(400).json({ error: 'Multiplicador inválido' });
      }

      if (player.punishments?.levelProgressionBlocked) {
        return res.status(403).json({ error: 'Jogador bloqueado para progresso' });
      }

      const now = Date.now();
      if (player.lastSpinAt && now - player.lastSpinAt < 800) {
        return res.status(429).json({ error: 'Espere um pouco antes de girar novamente' });
      }

      const correCost = multiplier;
      if ((player.balances?.corre || 0) < correCost) {
        return res.status(400).json({ error: 'Corre insuficiente' });
      }

      player.balances.corre -= correCost;
      player.lastSpinAt = now;

      const result = resolveSlotSpin();

      if (result.prison) {
        const loss = Math.floor((player.balances.dirtyMoney || 0) * 0.3);
        player.balances.dirtyMoney = Math.max(0, player.balances.dirtyMoney - loss);
      } else {
        const gain = Math.floor(result.dirtyGain * multiplier);
        player.balances.dirtyMoney += gain;
      }

      bumpVersion(player);
      await player.save();

      return res.json({
        result: {
          ...result,
          dirtyGain: result.prison ? 0 : Math.floor(result.dirtyGain * multiplier),
        },
        player: mergePlayerState(player.toObject()),
      });
    }

    return res.status(400).json({ error: 'Ação de jogo desconhecida' });
  } catch (error) {
    console.error('Erro em gameAction:', error);
    return res.status(500).json({ error: 'Erro ao processar ação do jogo' });
  }
}