import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Mongo
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Mongo conectado'))
  .catch(err => console.error(err));

// Schema
const playerSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  name: String,
  avatar: String,
  level: { type: Number, default: 1 },
  hp: { type: Number, default: 100 },
  money: { type: Number, default: 0 }
});

const Player = mongoose.model('Player', playerSchema);

// LOGIN GOOGLE
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

    res.json({
      token: jwtToken,
      player
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'erro no login' });
  }
});

app.get('/', (req, res) => {
  res.send('Servidor rodando 🚀');
});

app.listen(3000, () => console.log('Servidor ON'));
