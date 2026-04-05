import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import mercadopago from 'mercadopago';



dotenv.config();

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Mongo conectado'))
  .catch((err) => console.error('Erro Mongo:', err));

const playerSchema = new mongoose.Schema(
  {
    googleId: String,
    email: String,
    name: String,
    avatar: String,

    niveis: {
      playerLevel: { type: Number, default: 1 },
      barracoLevel: { type: Number, default: 1 },
      hierarchyLevel: { type: Number, default: 1 },
      arsenalLevel: { type: Number, default: 1 },
      giroLevel: { type: Number, default: 1 },
      lavagemLevel: { type: Number, default: 1 },
      luxuryLevel: { type: Number, default: 1 },
      briberyLevel: { type: Number, default: 1 },
    },

    balances: {
      dirtyMoney: { type: Number, default: 1000 },
      cleanMoney: { type: Number, default: 0 },
      corre: { type: Number, default: 1000 },
    },

    inventory: {
      items: { type: Array, default: [] },
      gifts: { type: Array, default: [] },
      rewards: { type: Array, default: [] },
    },

    pageLevels: {
      barraco: { type: Number, default: 1 },
      giro: { type: Number, default: 1 },
      lavagem: { type: Number, default: 1 },
      luxury: { type: Number, default: 1 },
      arsenal: { type: Number, default: 1 },
      bribery: { type: Number, default: 1 },
      hierarchy: { type: Number, default: 1 },
      home: { type: Number, default: 1 },
      game: { type: Number, default: 1 },
    },

    skills: {
      attack: { type: Number, default: 0 },
      defense: { type: Number, default: 0 },
      intelligence: { type: Number, default: 0 },
      agility: { type: Number, default: 0 },
      respect: { type: Number, default: 0 },
      vigor: { type: Number, default: 0 },
    },

    power: { type: Number, default: 0 },
    hierarchyBadge: { type: String, default: 'Antena' },

    barracoPosition: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
      z: { type: Number, default: 0 },
    },

    mapPosition: {
      tileX: { type: Number, default: 10 },
      tileY: { type: Number, default: 5 },
      worldX: { type: Number, default: 10 },
      worldY: { type: Number, default: 5 },
    },

    lastPassiveIncomeAt: { type: Number, default: Date.now },

    lastSpinAt: { type: Number, default: 0 },
  },

  { timestamps: true }
);

// CORREÇÃO: Garante que o banco de dados não aceite dois jogadores no mesmo lugar
playerSchema.index({ "mapPosition.tileX": 1, "mapPosition.tileY": 1 }, { unique: true, sparse: true });

const Player = mongoose.model('Player', playerSchema);

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não informado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

const ALLOWED_MULTIPLIERS = [1, 2, 5, 10, 25, 50];

function randomSlotSymbol() {
  const symbols = ['💎', '💵', '🔫', '🚔'];
  return symbols[Math.floor(Math.random() * symbols.length)];
}

function randomSlotReels() {
  return [randomSlotSymbol(), randomSlotSymbol(), randomSlotSymbol()];
}

function generateSlotOutcome() {
  const r = Math.random();

  if (r < 0.03) return ['💎', '💎', '💎'];
  if (r < 0.09) return ['🚔', '🚔', '🚔'];
  if (r < 0.2) return ['💵', '💵', '💵'];
  if (r < 0.34) return ['🔫', '🔫', '🔫'];
  if (r < 0.5) return ['💵', '💵', '🔫'];

  // CORREÇÃO: Garante que o fallback nunca sorteie prêmios máximos
  let fallback = randomSlotReels();
  while (
    (fallback[0] === '💎' && fallback[1] === '💎' && fallback[2] === '💎') ||
    (fallback[0] === '🚔' && fallback[1] === '🚔' && fallback[2] === '🚔') ||
    (fallback[0] === '💵' && fallback[1] === '💵' && fallback[2] === '💵') ||
    (fallback[0] === '🔫' && fallback[1] === '🔫' && fallback[2] === '🔫')
  ) {
    fallback = randomSlotReels();
  }

  return fallback;
}

function applyPassiveIncome(player) {
  const now = Date.now();
  const last = player.lastPassiveIncomeAt || now;

  const minutesPassed = Math.floor((now - last) / 60000);

  if (minutesPassed <= 0) return;

  const level = player.niveis?.playerLevel || 1;

  const ganho = minutesPassed * level;

  player.balances.corre += ganho;

  player.lastPassiveIncomeAt = now;
}

function executeSpinSlot(player, multiplier) {
  if (!Number.isFinite(multiplier)) {
    throw new Error('Multiplicador inválido');
  }

  if (!ALLOWED_MULTIPLIERS.includes(multiplier)) {
    throw new Error('Multiplicador não permitido');
  }

  if (!player?.balances) {
    throw new Error('Balances do player não encontrados');
  }

  if (player.balances.corre < multiplier) {
    throw new Error('Sem corre suficiente pra bancar esse corre.');
  }

  const now = Date.now();
  const lastSpinAt = player.lastSpinAt || 0;

  if (now - lastSpinAt < 800) {
    throw new Error('Ação muito rápida. Aguarde um instante.');
  }

  player.lastSpinAt = now;
  player.balances.corre -= multiplier;

  const reels = generateSlotOutcome();
  const [a, b, c] = reels;

  if (a === '🚔' && b === '🚔' && c === '🚔') {
    const currentDirty = player.balances.dirtyMoney || 0;
    const loss = currentDirty * 0.3;

    player.balances.dirtyMoney = Math.max(0, currentDirty - loss);

    return {
      reels,
      resultType: 'prison',
      gain: 0,
      lossPercent: 30,
      multiplier,
      message: '🚔 A casa caiu. Perdeu 30% do Commands Sujo.',
    };
  }

  if (a === '💎' && b === '💎' && c === '💎') {
    const gain = 10000 * multiplier;
    player.balances.dirtyMoney += gain;

    return {
      reels,
      resultType: 'jackpot',
      gain,
      lossPercent: 0,
      multiplier,
      message: `💎 JACKPOT! +${gain.toLocaleString('pt-BR')} Commands Sujo`,
    };
  }

  if (a === '💵' && b === '💵' && c === '💵') {
    const gain = 2000 * multiplier;
    player.balances.dirtyMoney += gain;

    return {
      reels,
      resultType: 'big_win',
      gain,
      lossPercent: 0,
      multiplier,
      message: `💵 Bateu forte! +${gain.toLocaleString('pt-BR')} Commands Sujo`,
    };
  } 

  if (a === '🔫' && b === '🔫' && c === '🔫') {
    const gain = 1200 * multiplier;
    player.balances.dirtyMoney += gain;

    return {
      reels,
      resultType: 'medium_win',
      gain,
      lossPercent: 0,
      multiplier,
      message: `🔫 Corre pesado! +${gain.toLocaleString('pt-BR')} Commands Sujo`, 
    };
  }

  if (
    (a === '💵' && b === '💵') ||
    (a === '💵' && c === '💵') ||
    (b === '💵' && c === '💵')
  ) {
    const gain = 600 * multiplier;
    player.balances.dirtyMoney += gain;

    return {
      reels,
      resultType: 'small_win',
      gain,
      lossPercent: 0,
      multiplier,
      message: `💵 Caiu bem. +${gain.toLocaleString('pt-BR')} Commands Sujo`, 
    };
  }

  const gain = 100 * multiplier;
  player.balances.dirtyMoney += gain;

  return {
    reels,
    resultType: 'common',
    gain,
    lossPercent: 0,
    multiplier,
    message: `⚡ Corre pequeno. +${gain.toLocaleString('pt-BR')} Commands Sujo`, 
  };
}

app.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    let player = await Player.findOne({ googleId: payload.sub });

    if (!player) {
      // CORREÇÃO: Sorteia posição vaga até encontrar uma disponível
      let randomX, randomY, positionExists;
      do {
        randomX = Math.floor(Math.random() * 40);
        randomY = Math.floor(Math.random() * 20);
        positionExists = await Player.findOne({ 
          "mapPosition.tileX": randomX, 
          "mapPosition.tileY": randomY 
        });
      } while (positionExists);

      player = await Player.create({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatar: payload.picture,
        mapPosition: {
          tileX: randomX,
          tileY: randomY,
          worldX: randomX,
          worldY: randomY,
        }
      });
    }

    const jwtToken = jwt.sign(
      { id: player._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    applyPassiveIncome(player);
    await player.save();

    return res.json({
      token: jwtToken,
      player,
    });
  } catch (err) {
    console.error('Erro no login Google:', err);
    return res.status(500).json({ error: 'erro no login' });
  }
});

app.post('/game/action', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { action, payload } = req.body;

    const player = await Player.findById(userId);

    if (!player) {
      return res.status(404).json({ error: 'Player não encontrado' });
    }

    applyPassiveIncome(player);

    if (action === 'spin_slot') {
      const multiplier = Number(payload?.multiplier ?? 1);
      const result = executeSpinSlot(player, multiplier);

      await player.save();

      return res.json({
        success: true,
        action,
        player,
        result,
        message: result.message,
      });
    }

    return res.status(400).json({ error: 'Ação inválida' });
  } catch (err) {
    console.error('Erro em /game/action:', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro interno do servidor',
    });
  }
});

app.get('/players', authMiddleware, async (req, res) => {
  try {
    const players = await Player.find(
      {},
      {
        _id: 1,
        name: 1,
        mapPosition: 1,
        'niveis.barracoLevel': 1
      }
    );

    const formatted = players.map((p) => ({
      id: p._id,
      name: p.name,
      tileX: p.mapPosition?.tileX || 0,
      tileY: p.mapPosition?.tileY || 0,
      worldX: p.mapPosition?.worldX || 0,
      worldY: p.mapPosition?.worldY || 0,
      barracoLevel: p.niveis?.barracoLevel || 1
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Erro ao buscar players:', error);
    res.status(500).json({ error: 'Erro ao buscar players' });
  }
});

app.post('/create-payment', async (req, res) => {
  try {
    const { title, amount } = req.body;

    const finalTitle = title || 'Compra Domínio do Comando';
    const finalAmount = Number(amount || 10);

    const result = await mercadopago.payment.create({
      transaction_amount: finalAmount,
      description: finalTitle,
      payment_method_id: 'pix',
      payer: {
        email: 'teste@test.com',
      },
    });

    const data = result.body.point_of_interaction.transaction_data;

    res.json({
      qr_code: data.qr_code,
      qr_code_base64: data.qr_code_base64,
      ticket_url: data.ticket_url,
    });
  } catch (error) {
    console.error('Erro ao criar pagamento:', error);
    res.status(500).json({
      error: 'Erro ao criar pagamento',
    });
  }
});
app.get('/', (req, res) => {
  res.send('Servidor rodando 🚀');
});

app.listen(PORT, () => {
  console.log(`Servidor ON na porta ${PORT}`);
});