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

// =======================
// DB
// =======================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('Mongo conectado'))
  .catch((err) => console.error('Erro Mongo:', err));

// =======================
// SCHEMA COMPLETO
// =======================
const playerSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  name: String,
  avatar: String,

  niveis: {
    playerLevel: { type: Number, default: 1 },
  },

  balances: {
    dirtyMoney: { type: Number, default: 1000 },
    cleanMoney: { type: Number, default: 0 },
    corre: { type: Number, default: 1000 },
  },

  skills: {
    attack: { type: Number, default: 1 },
    defense: { type: Number, default: 1 },
    agility: { type: Number, default: 1 },
    intelligence: { type: Number, default: 1 },
    respect: { type: Number, default: 1 },
  },

  power: { type: Number, default: 0 },
  isVIP: { type: Boolean, default: false },

  lastSkillTrainAt: { type: Number, default: 0 },
  lastAttackAt: { type: Number, default: 0 },

  mapPosition: {
    tileX: { type: Number, default: 0 },
    tileY: { type: Number, default: 0 },
  },
}, { timestamps: true });

const Player = mongoose.model('Player', playerSchema);

// =======================
// AUTH
// =======================
function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// =======================
// POWER CALCULATION
// =======================
function calculatePower(player) {
  const s = player.skills;

  const base =
    s.attack * 3 +
    s.defense * 2 +
    s.agility * 2 +
    s.intelligence * 1.5 +
    s.respect * 1;

  return Math.floor(base);
}
// =======================
// LOGIN GOOGLE
// =======================
app.post('/auth/google', async (req, res) => {
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

  player.power = calculatePower(player);
  await player.save();

  const jwtToken = jwt.sign(
    { id: player._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token: jwtToken, player });
});

// =======================
// GET PLAYER
// =======================
app.get('/player/me', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);

  player.power = calculatePower(player);
  await player.save();

  res.json({ player });
});

// =======================
// UPDATE PLAYER (SEM POWER)
// =======================
app.patch('/player/update', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);

  const incoming = req.body;

  if (incoming.balances) {
    player.balances = incoming.balances;
  }

  if (incoming.skills) {
    player.skills = incoming.skills;
  }

  player.power = calculatePower(player);

  await player.save();

  res.json({ player });
});

// =======================
// TREINO DE SKILL
// =======================
app.post('/skill/train', authMiddleware, async (req, res) => {
  const { skill } = req.body;

  const player = await Player.findById(req.user.id);

  const now = Date.now();

  if (now - player.lastSkillTrainAt < 5000) {
    return res.status(400).json({ error: 'Cooldown ativo' });
  }

  const cost = 100;

  if (player.balances.cleanMoney < cost) {
    return res.status(400).json({ error: 'Sem dinheiro limpo' });
  }

  player.balances.cleanMoney -= cost;

  const bonus = player.isVIP ? 2 : 1;

  player.skills[skill] += bonus;

  player.lastSkillTrainAt = now;

  player.power = calculatePower(player);

  await player.save();

  res.json({ player });
});

// =======================
// ATAQUE ENTRE JOGADORES
// =======================
app.post('/attack', authMiddleware, async (req, res) => {
  const { targetId } = req.body;

  const attacker = await Player.findById(req.user.id);
  const defender = await Player.findById(targetId);

  const now = Date.now();

  if (now - attacker.lastAttackAt < 10000) {
    return res.status(400).json({ error: 'Cooldown ataque' });
  }

  attacker.power = calculatePower(attacker);
  defender.power = calculatePower(defender);

  const winChance =
    attacker.power / (attacker.power + defender.power);

  const win = Math.random() < winChance;

  let stolen = 0;

  if (win) {
    stolen = defender.balances.dirtyMoney * 0.1;

    defender.balances.dirtyMoney -= stolen;
    attacker.balances.dirtyMoney += stolen;
  }

  attacker.lastAttackAt = now;

  await attacker.save();
  await defender.save();

  res.json({
    win,
    stolen,
    attackerPower: attacker.power,
    defenderPower: defender.power,
  });
});

// =======================
// LISTAR PLAYERS (MAPA)
// =======================
app.get('/players', authMiddleware, async (req, res) => {
  const players = await Player.find();

  const formatted = players.map((p) => ({
    id: p._id,
    name: p.name,
    tileX: p.mapPosition?.tileX || 0,
    tileY: p.mapPosition?.tileY || 0,
    power: calculatePower(p),
  }));

  res.json(formatted);
});

// =======================
// PIX
// =======================
app.post('/create-payment', async (req, res) => {
  const { amount } = req.body;

  const result = await mercadopago.payment.create({
    transaction_amount: Number(amount || 10),
    description: 'Compra',
    payment_method_id: 'pix',
    payer: { email: 'teste@test.com' },
  });

  const data = result.body.point_of_interaction.transaction_data;

  res.json({
    qr_code: data.qr_code,
    qr_code_base64: data.qr_code_base64,
  });
});

// =======================
app.get('/', (req, res) => {
  res.send('Servidor ON 🚀');
});

app.listen(PORT, () => {
  console.log(`Rodando na porta ${PORT}`);
});