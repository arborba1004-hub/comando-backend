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
    businessId: Number,
    date: String,
    amount: Number,
  },
  { _id: false }
);

const purchasedAccessorySchema = new mongoose.Schema(
  {
    accessoryId: String,
    skillType: String,
    purchasedAt: String,
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
      attack: { type: Number, default: 10 },
      defense: { type: Number, default: 10 },
      intelligence: { type: Number, default: 10 },
      agility: { type: Number, default: 10 },
      respect: { type: Number, default: 10 },
      vigor: { type: Number, default: 10 },
    },

    power: { type: Number, default: 0 },

    health: { type: Number, default: 100 },

    lastAttackAt: { type: Number, default: 0 },

    // 🔥 NOVO SISTEMA
    combatStats: {
      baseDamage: Number,
      damageReduction: Number,
      critChance: Number,
      critDamage: Number,
      dodgeChance: Number,
      maxHealth: Number,
    },

    vip: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Player = mongoose.model('Player', playerSchema);



function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function applyPassiveIncome(player) {
  const now = Date.now();
  const last = player.lastPassiveIncomeAt || now;
  const minutes = Math.floor((now - last) / 60000);

  if (minutes > 0) {
    player.balances.corre += minutes * (player.niveis.playerLevel || 1);
    player.lastPassiveIncomeAt = now;
  }
}


function calculateCombatStats(player) {
  const s = player.skills;
  const n = player.niveis;

  const power =
    s.attack * 12 +
    s.defense * 10 +
    s.intelligence * 8 +
    s.agility * 9 +
    s.respect * 7 +
    s.vigor * 11 +
    n.playerLevel * 15 +
    n.arsenalLevel * 20 +
    n.hierarchyLevel * 18 +
    n.barracoLevel * 5;

  return {
    power: Math.round(power),
    baseDamage: s.attack * 2 + n.arsenalLevel * 3,
    damageReduction: Math.min(0.65, s.defense * 0.008),
    critChance: Math.min(0.35, s.agility * 0.003),
    critDamage: 1.5 + s.intelligence * 0.01,
    dodgeChance: Math.min(0.25, s.agility * 0.002),
    maxHealth: 100 + s.vigor * 8,
  };
}

function applyCombatStats(player) {
  const stats = calculateCombatStats(player);

  player.power = stats.power;
  player.combatStats = stats;

  if (!player.health) {
    player.health = stats.maxHealth;
  }

  player.health = Math.min(player.health, stats.maxHealth);
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
      player = await Player.create({
        googleId: payload.sub,
        email: payload.email,
        name: payload.name,
        avatar: payload.picture,
      });
    }

    applyPassiveIncome(player);
    applyCombatStats(player);

    await player.save();

    const jwtToken = jwt.sign({ id: player._id }, process.env.JWT_SECRET);

    res.json({ token: jwtToken, player });
  } catch (err) {
    res.status(500).json({ error: 'erro login' });
  }
});

app.get('/player/me', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);

  applyPassiveIncome(player);
  applyCombatStats(player);

  await player.save();

  res.json({ player });
});

app.patch('/player/update', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);

  Object.assign(player, req.body);

  applyCombatStats(player);

  await player.save();

  res.json({ player });
});


app.post('/attack', authMiddleware, async (req, res) => {
  const attacker = await Player.findById(req.user.id);
  const defender = await Player.findById(req.body.targetId);

  const atk = calculateCombatStats(attacker);
  const def = calculateCombatStats(defender);

  let atkHP = atk.maxHealth;
  let defHP = def.maxHealth;

  while (atkHP > 0 && defHP > 0) {
    defHP -= Math.max(1, atk.baseDamage * (1 - def.damageReduction));
    if (defHP <= 0) break;

    atkHP -= Math.max(1, def.baseDamage * (1 - atk.damageReduction));
  }

  const win = atkHP > 0;

  if (win) {
    const stolen = Math.floor(defender.balances.dirtyMoney * 0.1);
    attacker.balances.dirtyMoney += stolen;
    defender.balances.dirtyMoney -= stolen;
  }

  await attacker.save();
  await defender.save();

  res.json({ win });
});


app.listen(PORT, () => {
  console.log(`Servidor ON na porta ${PORT}`);
});