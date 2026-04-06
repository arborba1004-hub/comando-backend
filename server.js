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