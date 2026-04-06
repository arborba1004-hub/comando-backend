import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import mercadopago from 'mercadopago';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Mongo conectado'))
  .catch(err => console.error(err));
const playerSchema = new mongoose.Schema({

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

  skills: {
    attack: { type: Number, default: 1 },
    defense: { type: Number, default: 1 },
    agility: { type: Number, default: 1 },
    intelligence: { type: Number, default: 1 },
    respect: { type: Number, default: 1 },
    vigor: { type: Number, default: 1 },
  },

  power: { type: Number, default: 0 },

  ranking: {
    points: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
  },

  rivalry: {
    nemesisPlayerId: { type: String, default: '' },
    revengeTargetId: { type: String, default: '' },
    lastAttackedBy: { type: String, default: '' },
    lastAttackedAt: { type: Number, default: 0 },
  },

  attackHistory: { type: Array, default: [] },

  laundryProgress: {
    activeOperations: { type: Array, default: [] },
    dailyOperations: { type: Array, default: [] },
  },

  punishments: { type: Object, default: {} },

  lastSkillTrainAt: { type: Number, default: 0 },
  lastAttackAt: { type: Number, default: 0 },

  mapPosition: {
    tileX: { type: Number, default: 10 },
    tileY: { type: Number, default: 5 },
  },

}, { timestamps: true });

const Player = mongoose.model('Player', playerSchema);
function calculatePower(player) {
  const s = player.skills;

  return Math.floor(
    s.attack * 3 +
    s.defense * 2 +
    s.agility * 2 +
    s.intelligence * 1.5 +
    s.respect * 1 +
    s.vigor * 1.2
  );
}

function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}


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


app.get('/player/me', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);

  player.power = calculatePower(player);
  await player.save();

  res.json({ player });
});

app.patch('/player/update', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);

  const incoming = req.body;

  if (incoming.balances) player.balances = incoming.balances;
  if (incoming.skills) player.skills = incoming.skills;
  if (incoming.inventory) player.inventory = incoming.inventory;
  if (incoming.laundryProgress) player.laundryProgress = incoming.laundryProgress;

  player.power = calculatePower(player);

  await player.save();

  res.json({ player });
});



app.post('/skill/train', authMiddleware, async (req, res) => {
  const { skill } = req.body;

  const player = await Player.findById(req.user.id);

  const now = Date.now();

  if (now - player.lastSkillTrainAt < 3000) {
    return res.status(400).json({ error: 'Cooldown' });
  }

  const cost = 100;

  if (player.balances.cleanMoney < cost) {
    return res.status(400).json({ error: 'Sem dinheiro' });
  }

  player.balances.cleanMoney -= cost;
  player.skills[skill] += 1;

  player.lastSkillTrainAt = now;

  player.power = calculatePower(player);

  await player.save();

  res.json({ player });
});



app.post('/attack', authMiddleware, async (req, res) => {

  const { targetId } = req.body;

  const attacker = await Player.findById(req.user.id);
  const defender = await Player.findById(targetId);

  if (!attacker || !defender) {
    return res.status(404).json({ error: 'Player não encontrado' });
  }

  const now = Date.now();

  if (now - attacker.lastAttackAt < 5000) {
    return res.status(400).json({ error: 'Cooldown ataque' });
  }

  attacker.power = calculatePower(attacker);
  defender.power = calculatePower(defender);

  const chance = attacker.power / (attacker.power + defender.power);

  const win = Math.random() < chance;

  let stolen = 0;

  if (win) {
    stolen = defender.balances.dirtyMoney * 0.1;

    defender.balances.dirtyMoney -= stolen;
    attacker.balances.dirtyMoney += stolen;

    attacker.ranking.points += 20;
    attacker.ranking.wins++;
    attacker.ranking.streak++;

    defender.ranking.losses++;
    defender.ranking.streak = 0;

    attacker.rivalry.nemesisPlayerId = defender._id.toString();
    defender.rivalry.revengeTargetId = attacker._id.toString();
  } else {
    attacker.ranking.losses++;
    attacker.ranking.streak = 0;

    defender.ranking.wins++;
    defender.ranking.streak++;
  }

  attacker.lastAttackAt = now;

  attacker.attackHistory.unshift({
    attackerId: attacker._id,
    defenderId: defender._id,
    result: win ? 'win' : 'loss',
    stolen,
    createdAt: now
  });

  attacker.attackHistory = attacker.attackHistory.slice(0, 20);

  await attacker.save();
  await defender.save();

  res.json({
    win,
    stolen,
    attacker,
    defender
  });



app.get('/leaderboard', authMiddleware, async (req, res) => {

  const players = await Player.find().sort({ 'ranking.points': -1 }).limit(50);

  res.json(players);

});


app.post('/create-payment', async (req, res) => {

  const result = await mercadopago.payment.create({
    transaction_amount: 10,
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


app.get('/', (req, res) => {
  res.send('Servidor ON 🚀');
});

app.listen(PORT, () => {
  console.log('Rodando 🚀');
});
});



app.get('/leaderboard', authMiddleware, async (req, res) => {

  const players = await Player.find().sort({ 'ranking.points': -1 }).limit(50);

  res.json(players);

});

