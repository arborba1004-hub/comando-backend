import express from 'express';
import cors from 'cors';

import { env } from './config/env.js';
import { connectDB } from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import playersRoutes from './routes/playersRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import laundryRoutes from './routes/laundryRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import briberyRoutes from './routes/briberyRoutes.js';
import gangRoutes from './routes/gangRoutes.js';
import attackRoutes from './routes/attackRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import factionRoutes from './routes/factionRoutes.js';

const app = express();

app.use(
  cors({
    origin: env.FRONTEND_URL === '*' ? true : env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));

app.get('/', (req, res) => {
  res.send('Servidor rodando 🚀');
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'comando-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/auth', authRoutes);
app.use('/player', playerRoutes);
app.use('/players', playersRoutes);
app.use('/chat', chatRoutes);
app.use('/laundry', laundryRoutes);
app.use('/game', gameRoutes);
app.use('/gang', gangRoutes);
app.use('/attack', attackRoutes);
app.use('/notifications', notificationRoutes);
app.use('/faction', factionRoutes);
app.use('/', briberyRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
  });
});

async function startServer() {
  try {
    await connectDB();

    app.listen(env.PORT, () => {
      console.log(`🚀 Backend rodando na porta ${env.PORT}`);
    });
  } catch (error) {
    console.error('❌ Não foi possível iniciar o servidor:', error);
    process.exit(1);
  }
}

startServer();

export default app;