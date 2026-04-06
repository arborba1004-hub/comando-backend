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

// SCHEMAS AUXILIARES
const activeOperationSchema = new mongoose.Schema({
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
    status: { type: String, enum: ['processing', 'completed'], default: 'processing' },
}, { _id: false });

const dailyOperationSchema = new mongoose.Schema({
    businessId: { type: Number, required: true },
    date: { type: String, required: true },
    amount: { type: Number, default: 0 },
}, { _id: false });

const purchasedAccessorySchema = new mongoose.Schema({
    accessoryId: { type: String, required: true },
    skillType: { type: String, required: true },
    purchasedAt: { type: String, required: true },
}, { _id: false });

const playerSchema = new mongoose.Schema({
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
    vip: { type: Boolean, default: false },
    lastSkillTrainAt: { type: Number, default: 0 },
    lastAttackAt: { type: Number, default: 0 },
    hierarchyBadge: { type: String, default: 'Antena' },
    barracoPosition: { x: { type: Number, default: 0 }, y: { type: Number, default: 0 }, z: { type: Number, default: 0 } },
    mapPosition: { tileX: { type: Number, default: 10 }, tileY: { type: Number, default: 5 }, worldX: { type: Number, default: 10 }, worldY: { type: Number, default: 5 } },
    laundryProgress: {
      activeOperations: { type: [activeOperationSchema], default: [] },
      dailyOperations: { type: [dailyOperationSchema], default: [] },
    },
    punishments: {
      active: [{ type: { type: String, enum: ['fiscal', 'arsenal', 'militia', 'blitz', 'threat'] }, expiresAt: String }],
      delacao: { active: { type: Boolean, default: false }, expiresAt: { type: String, default: null } },
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
    headerCustomization: { playerNameFont: { type: String, default: 'oswald' }, playerNameFontSize: { type: String, default: '1.875rem' }, playerNameColor: { type: String, default: '#1a1205' } },
    ownedVehicles: { type: [String], default: [] },
    purchasedAccessories: { type: [purchasedAccessorySchema], default: [] },
    accessories: { vehicles: { type: Map, of: [String], default: {} }, weapons: { type: Map, of: [String], default: {} } },
    version: { type: Number, default: 0 },
    lastPassiveIncomeAt: { type: Number, default: Date.now },
    lastSpinAt: { type: Number, default: 0 },
}, { timestamps: true });

playerSchema.index({ 'mapPosition.tileX': 1, 'mapPosition.tileY': 1 }, { unique: true, sparse: true });
const Player = mongoose.model('Player', playerSchema);


// HELPERS
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não informado' });
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) { return res.status(401).json({ error: 'Token inválido' }); }
}

const ALLOWED_MULTIPLIERS = [1, 2, 5, 10, 25, 50];

function generateSlotOutcome() {
  const r = Math.random();
  if (r < 0.03) return ['💎', '💎', '💎'];
  if (r < 0.09) return ['🚔', '🚔', '🚔'];
  if (r < 0.2) return ['💵', '💵', '💵'];
  if (r < 0.34) return ['🔫', '🔫', '🔫'];
  if (r < 0.5) return ['💵', '💵', '🔫'];
  return ['💎', '💵', '🔫', '🚔'].sort(() => 0.5 - Math.random()).slice(0, 3);
}

function applyPassiveIncome(player) {
  const now = Date.now();
  const last = player.lastPassiveIncomeAt || now;
  const minutesPassed = Math.floor((now - last) / 60000);
  if (minutesPassed <= 0) return;
  player.balances.corre += minutesPassed * (player.niveis?.playerLevel || 1);
  player.lastPassiveIncomeAt = now;
}

function executeSpinSlot(player, multiplier) {
  if (!ALLOWED_MULTIPLIERS.includes(multiplier)) throw new Error('Multiplicador não permitido');
  if (player.balances.corre < multiplier) throw new Error('Sem corre suficiente.');
  
  const now = Date.now();
  if (now - (player.lastSpinAt || 0) < 800) throw new Error('Ação muito rápida.');

  player.lastSpinAt = now;
  player.balances.corre -= multiplier;
  const reels = generateSlotOutcome();
  const [a, b, c] = reels;

  if (a === '🚔' && b === '🚔' && c === '🚔') {
    player.balances.dirtyMoney *= 0.7;
    return { reels, resultType: 'prison', message: '🚔 Perdeu 30% do Sujo.' };
  }
  // Logica simplificada de prêmios (Jackpot, Big Win, etc)
  let gain = 0;
  if (a === '💎' && b === '💎' && c === '💎') gain = 10000 * multiplier;
  else if (a === '💵' && b === '💵' && c === '💵') gain = 2000 * multiplier;
  else gain = 100 * multiplier;

  player.balances.dirtyMoney += gain;
  return { reels, gain, message: `Ganhou ${gain}` };
}

// AUTH
app.post('/auth/google', async (req, res) => {
  try {
    const { token } = req.body;
    const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    let player = await Player.findOne({ googleId: payload.sub });

    if (!player) {
      player = await Player.create({
        googleId: payload.sub, email: payload.email, name: payload.name, avatar: payload.picture,
        mapPosition: { tileX: Math.floor(Math.random() * 40), tileY: Math.floor(Math.random() * 20) }
      });
    }
    const jwtToken = jwt.sign({ id: player._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    applyPassiveIncome(player);
    await player.save();
    res.json({ token: jwtToken, player });
  } catch (err) { res.status(500).json({ error: 'erro no login' }); }
});





// PLAYER & GAME ACTIONS
app.get('/player/me', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);
  applyPassiveIncome(player);
  await player.save();
  res.json({ player });
});

app.patch('/player/update', authMiddleware, async (req, res) => {
  const player = await Player.findByIdAndUpdate(req.user.id, { $set: req.body, $inc: { version: 1 } }, { new: true });
  res.json({ player });
});

app.post('/game/action', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);
  if (req.body.action === 'spin_slot') {
    const result = executeSpinSlot(player, Number(req.body.payload?.multiplier || 1));
    await player.save();
    return res.json({ success: true, player, result });
  }
  res.status(400).json({ error: 'Ação inválida' });
});

// LAVAGEM (LAUNDRY)
app.post('/laundry/start', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);
  const { grossAmount, businessId, netAmount } = req.body;
  if (player.balances.dirtyMoney < grossAmount) return res.status(400).json({ error: 'Saldo insuficiente' });
  
  player.balances.dirtyMoney -= grossAmount;
  const operationId = new mongoose.Types.ObjectId().toString();
  player.laundryProgress.activeOperations.push({ ...req.body, operationId, status: 'processing', endsAt: new Date(Date.now() + 15000).toISOString() });
  await player.save();
  res.json({ operationId, player });
});

app.post('/laundry/complete', authMiddleware, async (req, res) => {
  const player = await Player.findById(req.user.id);
  const opIndex = player.laundryProgress.activeOperations.findIndex(o => o.operationId === req.body.operationId);
  if (opIndex > -1) {
    player.balances.cleanMoney += player.laundryProgress.activeOperations[opIndex].netAmount;
    player.laundryProgress.activeOperations.splice(opIndex, 1);
    await player.save();
  }
  res.json({ player });
});

// PAGAMENTO (MERCADO PAGO)
app.post('/create-payment', async (req, res) => {
  try {
    const result = await mercadopago.payment.create({
      transaction_amount: Number(req.body.amount || 10),
      description: req.body.title || 'Compra Jogo',
      payment_method_id: 'pix',
      payer: { email: 'teste@test.com' }
    });
    const data = result.body.point_of_interaction.transaction_data;
    res.json({ qr_code: data.qr_code, qr_code_base64: data.qr_code_base64 });
  } catch (error) { res.status(500).json({ error: 'Erro no pagamento' }); }
});

app.get('/', (req, res) => res.send('Servidor rodando 🚀'));
app.listen(PORT, () => console.log(`Servidor ON na porta ${PORT}`));
