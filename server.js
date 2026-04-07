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

// ==========================================
// SCHEMAS AUXILIARES
// ==========================================
const activeOperationSchema = new mongoose.Schema(
  {
    id: { type: String, default: '' },
    operationId: { type: String, default: '' },
    businessId: { type: Number, required: true },
    businessName: { type: String, default: '' },
    startedAt: { type: String, default: '' },
    endsAt: { type: String, default: '' },
    grossAmount: { type: Number, default: 0 },
    feePercentage: { type: Number, default: 0 },
    feeAmount: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['processing', 'completed'],
      default: 'processing',
    },
  },
  { _id: false }
);

const dailyOperationSchema = new mongoose.Schema(
  {
    businessId: { type: Number, required: true },
    date: { type: String, required: true },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const purchasedAccessorySchema = new mongoose.Schema(
  {
    accessoryId: { type: String, required: true },
    skillType: { type: String, required: true },
    purchasedAt: { type: String, required: true },
  },
  { _id: false }
);

const playerSchema = new mongoose.Schema(
  {
    googleId: { type: String, index: true },
    email: String,
    name: String,
    avatar: String,

    // 🟣 FACÇÃO (IMPORTANTE)
    factionId: {
      type: String,
      default: null,
    },
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
vip: { type: Boolean, default: false },

lastSkillTrainAt: { type: Number, default: 0 },
lastAttackAt: { type: Number, default: 0 },
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

    laundryProgress: {
      activeOperations: { type: [activeOperationSchema], default: [] },
      dailyOperations: { type: [dailyOperationSchema], default: [] },
    },

    punishments: {
      active: {
        type: [
          {
            type: {
              type: String,
              enum: ['fiscal', 'arsenal', 'militia', 'blitz', 'threat'],
            },
            expiresAt: String,
          },
        ],
        default: [],
      },
      delacao: {
        active: { type: Boolean, default: false },
        expiresAt: { type: String, default: null },
      },
      inventoryBlocked: { type: Boolean, default: false },
      dirtyMoneyBlocked: { type: Boolean, default: false },
      cleanMoneyBlocked: { type: Boolean, default: false },
      levelProgressionBlocked: { type: Boolean, default: false },
      inventoryBonusReductionPercent: { type: Number, default: 0 },
      pvpProtectionUntil: { type: String, default: null },
      delacaoRewardPending: { type: Boolean, default: false },
      delacaoRewardUnlockAt: { type: String, default: null },
      pendingSkillBoost: { type: Number, default: 0 },
      lastVehicleLost: { type: Boolean, default: false },
    },

    skillBoostMultiplier: { type: Number, default: 1.0 },

    headerCustomization: {
      playerNameFont: { type: String, default: 'oswald' },
      playerNameFontSize: { type: String, default: '1.875rem' },
      playerNameColor: { type: String, default: '#1a1205' },
    },

    ownedVehicles: { type: [String], default: [] },

    purchasedAccessories: {
      type: [purchasedAccessorySchema],
      default: [],
    },

    accessories: {
      vehicles: {
        type: Map,
        of: [String],
        default: {},
      },
      weapons: {
        type: Map,
        of: [String],
        default: {},
      },
    },

    version: { type: Number, default: 0 },

    lastPassiveIncomeAt: { type: Number, default: Date.now },
    lastSpinAt: { type: Number, default: 0 },
  },
  { timestamps: true }
);

playerSchema.index(
  { 'mapPosition.tileX': 1, 'mapPosition.tileY': 1 },
  { unique: true, sparse: true }
);

const Player = mongoose.model('Player', playerSchema);

// ==========================================
// HELPERS
// ==========================================
async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token não informado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const player = await Player.findById(decoded.id);

    if (!player) {
      return res.status(401).json({ error: 'Player não encontrado' });
    }

    req.user = {
      id: player._id,
      name: player.name,
      factionId: player.factionId || null,
    };

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

function bumpVersion(player) {
  player.version = (player.version || 0) + 1;
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

// ==========================================
// AUTH
// ==========================================
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
      let randomX, randomY, positionExists;
      do {
        randomX = Math.floor(Math.random() * 40);
        randomY = Math.floor(Math.random() * 20);
        positionExists = await Player.findOne({
          'mapPosition.tileX': randomX,
          'mapPosition.tileY': randomY,
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
        },
      });
    }

    const jwtToken = jwt.sign(
      { id: player._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    applyPassiveIncome(player);
    bumpVersion(player);
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


// ==========================================
// PLAYER
// ==========================================
app.get('/player/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const player = await Player.findById(userId);

    if (!player) {
      return res.status(404).json({ error: 'Player não encontrado' });
    }

    applyPassiveIncome(player);
    bumpVersion(player);
    await player.save();

    return res.json({ player });
  } catch (error) {
    console.error('Erro em /player/me:', error);
    return res.status(500).json({ error: 'Erro ao buscar player' });
  }
});

app.patch('/player/update', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const incoming = req.body || {};

    const player = await Player.findById(userId);

    if (!player) {
      return res.status(404).json({ error: 'Player não encontrado' });
    }

    if (incoming.niveis) {
      player.niveis = {
        ...player.niveis.toObject(),
        ...incoming.niveis,
      };
    }

    if (incoming.balances) {
      player.balances = {
        ...player.balances.toObject(),
        ...incoming.balances,
      };
    }

    if (incoming.inventory) {
      player.inventory = {
        ...player.inventory.toObject(),
        ...incoming.inventory,
      };
    }

    if (incoming.pageLevels) {
      player.pageLevels = {
        ...player.pageLevels.toObject(),
        ...incoming.pageLevels,
      };
    }

    if (incoming.skills) {
      player.skills = {
        ...player.skills.toObject(),
        ...incoming.skills,
      };
    }

    if (incoming.power !== undefined) {
      player.power = incoming.power;
    }

    if (incoming.hierarchyBadge !== undefined) {
      player.hierarchyBadge = incoming.hierarchyBadge;
    }

    if (incoming.barracoPosition) {
      player.barracoPosition = {
        ...player.barracoPosition.toObject(),
        ...incoming.barracoPosition,
      };
    }

    if (incoming.mapPosition) {
      player.mapPosition = {
        ...player.mapPosition.toObject(),
        ...incoming.mapPosition,
      };
    }

    if (incoming.laundryProgress !== undefined) {
      player.laundryProgress = incoming.laundryProgress;
    }

    if (incoming.punishments !== undefined) {
      player.punishments = incoming.punishments;
    }

    if (incoming.skillBoostMultiplier !== undefined) {
      player.skillBoostMultiplier = incoming.skillBoostMultiplier;
    }

    if (incoming.headerCustomization !== undefined) {
      player.headerCustomization = incoming.headerCustomization;
    }

    if (incoming.ownedVehicles !== undefined) {
      player.ownedVehicles = incoming.ownedVehicles;
    }

    if (incoming.purchasedAccessories !== undefined) {
      player.purchasedAccessories = incoming.purchasedAccessories;
    }

    if (incoming.accessories !== undefined) {
      player.accessories = incoming.accessories;
    }

    bumpVersion(player);
    await player.save();

    return res.json({ player });
  } catch (error) {
    console.error('Erro em /player/update:', error);
    return res.status(500).json({ error: 'Erro ao atualizar player' });
  }
});
const chatSchema = new mongoose.Schema({
  channel: String,

  senderId: String,
  senderName: String,

  recipientId: String,
  recipientName: String,

  factionId: String,
  subject: String, // <-- O campo do assunto foi adicionado aqui

  body: String,

  createdAt: Date,
  read: Boolean,
});


const Chat = mongoose.model('Chat', chatSchema);



// ==========================================
// GAME
// ==========================================
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

      bumpVersion(player);
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

// ==========================================
// PLAYERS
// ==========================================
app.get('/players', authMiddleware, async (req, res) => {
  try {
    const players = await Player.find(
      {},
      {
        _id: 1,
        name: 1,
        mapPosition: 1,
        'niveis.barracoLevel': 1,
      }
    );

    const formatted = players.map((p) => ({
      id: p._id,
      name: p.name,
      tileX: p.mapPosition?.tileX || 0,
      tileY: p.mapPosition?.tileY || 0,
      worldX: p.mapPosition?.worldX || 0,
      worldY: p.mapPosition?.worldY || 0,
      barracoLevel: p.niveis?.barracoLevel || 1,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Erro ao buscar players:', error);
    res.status(500).json({ error: 'Erro ao buscar players' });
  }
});

// ==========================================
// LAVAGEM
// ==========================================
app.get('/laundry/can-operate/:businessId', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const businessId = Number(req.params.businessId);

    const player = await Player.findById(userId);

    if (!player) {
      return res.status(404).json({ error: 'Player não encontrado' });
    }

    if (!player.laundryProgress) {
      player.laundryProgress = {
        activeOperations: [],
        dailyOperations: [],
      };
    }

    const today = new Date().toISOString().split('T')[0];
    const alreadyUsedToday = (player.laundryProgress.dailyOperations || []).some(
      (op) => op.businessId === businessId && op.date === today
    );

    return res.json({ allowed: !alreadyUsedToday });
  } catch (error) {
    console.error('Erro em /laundry/can-operate/:businessId:', error);
    return res.status(500).json({ error: 'Erro ao verificar operação diária' });
  }
});

app.post('/laundry/start', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      businessId,
      businessName,
      grossAmount,
      feePercentage,
      feeAmount,
      netAmount,
    } = req.body;

    const player = await Player.findById(userId);

    if (!player) {
      return res.status(404).json({ error: 'Player não encontrado' });
    }

    if (!player.laundryProgress) {
      player.laundryProgress = {
        activeOperations: [],
        dailyOperations: [],
      };
    }

    const today = new Date().toISOString().split('T')[0];

    const alreadyUsedToday = (player.laundryProgress.dailyOperations || []).some(
      (op) => op.businessId === Number(businessId) && op.date === today
    );

    if (alreadyUsedToday) {
      return res.status(400).json({ error: 'Você já realizou uma operação neste comércio hoje' });
    }

    if ((player.balances?.dirtyMoney || 0) < Number(grossAmount)) {
      return res.status(400).json({ error: 'Dinheiro sujo insuficiente' });
    }

    player.balances.dirtyMoney -= Number(grossAmount);

    const operationId = new mongoose.Types.ObjectId().toString();
    const endsAt = new Date(Date.now() + 15000).toISOString();

    player.laundryProgress.activeOperations.push({
      id: operationId,
      operationId,
      businessId: Number(businessId),
      businessName: String(businessName || ''),
      startedAt: new Date().toISOString(),
      endsAt,
      grossAmount: Number(grossAmount),
      feePercentage: Number(feePercentage),
      feeAmount: Number(feeAmount),
      netAmount: Number(netAmount),
      status: 'processing',
    });

    player.laundryProgress.dailyOperations.push({
      businessId: Number(businessId),
      date: today,
      amount: Number(grossAmount),
    });

    bumpVersion(player);
    await player.save();

    return res.json({
      operationId,
      endsAt,
      player,
    });
  } catch (error) {
    console.error('Erro em /laundry/start:', error);
    return res.status(500).json({ error: 'Erro ao iniciar lavagem' });
  }
});

app.post('/laundry/complete', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { operationId } = req.body;

    const player = await Player.findById(userId);

    if (!player) {
      return res.status(404).json({ error: 'Player não encontrado' });
    }

    if (!player.laundryProgress) {
      return res.status(400).json({ error: 'Nenhuma operação encontrada' });
    }

    const operations = player.laundryProgress.activeOperations || [];
    const operation = operations.find(
      (op) => op.operationId === operationId && op.status === 'processing'
    );

    if (!operation) {
      return res.status(404).json({ error: 'Operação não encontrada' });
    }

    operation.status = 'completed';
    player.balances.cleanMoney += Number(operation.netAmount || 0);

    player.laundryProgress.activeOperations = operations.filter(
      (op) => op.operationId !== operationId
    );

    bumpVersion(player);
    await player.save();

    return res.json({ player });
  } catch (error) {
    console.error('Erro em /laundry/complete:', error);
    return res.status(500).json({ error: 'Erro ao completar lavagem' });
  }
});

// ==========================================
// PAGAMENTO
// ==========================================
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

// ==========================================
// CHAT
// ==========================================

// ENVIAR MENSAGEM
app.post('/chat/send', authMiddleware, async (req, res) => {
  try {
    const {
      channel,
      body,
      recipientId,
      recipientName,
      factionId,
      subject,
    } = req.body;

    const newMessage = await Chat.create({
      channel,
      body,
      senderId: req.user.id,
      senderName: req.user.name,
      recipientId,
      recipientName,
      factionId,
      subject,
      createdAt: new Date(),
      read: false,
    });

    res.json({ success: true, message: newMessage });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// BUSCAR MENSAGENS
app.get('/chat/messages', authMiddleware, async (req, res) => {
  try {
    const { channel } = req.query;
    const userId = req.user.id.toString();

    let query = {};

    if (channel === 'complexo') {
      query.channel = 'complexo';
    }

    if (channel === 'faccao') {
      query.channel = 'faccao';
      query.factionId = req.user.factionId;
    }

    if (channel === 'mail') {
      query.channel = 'mail';
      query.$or = [
        { senderId: userId },
        { recipientId: userId },
      ];
    }

    const messages = await Chat.find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(messages.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar mensagens' });
  }
});

// ==========================================
// HEALTHCHECK
// ==========================================
app.get('/', (req, res) => {
  res.send('Servidor rodando 🚀');
});

app.listen(PORT, () => {
  console.log(`Servidor ON na porta ${PORT}`);
});