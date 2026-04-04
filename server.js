import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

dotenv.config();

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

    lastSpinAt: { type: Number, default: 0 },
  },
  { timestamps: true }
);

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

/* ======================= NOVA ROTA ======================= */
app.get('/players', authMiddleware, async (req, res) => {
  try {
    const players = await Player.find({}, {
      _id: 1,
      barracoPosition: 1,
    });

    const formatted = players.map(p => ({
      id: p._id,
      tileX: p.barracoPosition?.x || 0,
      tileY: p.barracoPosition?.z || 0,
      worldX: p.barracoPosition?.x || 0,
      worldY: p.barracoPosition?.z || 0,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Erro ao buscar players:', error);
    res.status(500).json({ error: 'Erro ao buscar players' });
  }
});
/* ========================================================= */

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

    const jwtToken = jwt.sign(
      { id: player._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

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

app.get('/', (req, res) => {
  res.send('Servidor rodando 🚀');
});

app.listen(PORT, () => {
  console.log(`Servidor ON na porta ${PORT}`);
});