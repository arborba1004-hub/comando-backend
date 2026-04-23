import express from 'express';
import cors from 'cors';

import { env } from './config/env.js';
import { connectDB } from './config/db.js';

// Import das rotas
import authRoutes from './routes/authRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import playersRoutes from './routes/playersRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import laundryRoutes from './routes/laundryRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import briberyRoutes from './routes/briberyRoutes.js';
import trainingRoutes from './routes/trainingRoutes.js';
import gangWarRoutes from './routes/gangWarRoutes.js';
import attackRoutes from './routes/attackRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import factionRoutes from './routes/factionRoutes.js';
import shopRoutes from './routes/shopRoutes.js';
import arsenalRoutes from './routes/arsenalRoutes.js';
import fugaRoutes from './routes/fugaRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import factionHelpRoutes from './routes/factionHelpRoutes.js';
import factionInviteRoutes from './routes/factionInviteRoutes.js';

const app = express();

// Configuração de CORS
app.use(
  cors({
    origin: env.FRONTEND_URL === '*' ? true : env.FRONTEND_URL,
    credentials: true,
  })
);

// Parser de JSON
app.use(express.json({ limit: '2mb' }));

// Rotas básicas
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

// Rotas principais
app.use('/auth', authRoutes);
app.use('/player', playerRoutes);
app.use('/players', playersRoutes);
app.use('/chat', chatRoutes);
app.use('/faction-help', factionHelpRoutes);
app.use('/laundry', laundryRoutes);
app.use('/game', gameRoutes);
app.use('/api/training', trainingRoutes);

// Corrigido: prefixo explícito para gang-war
app.use('/gang-war', gangWarRoutes);

// Rotas de batalha/ataque
app.use('/battle', attackRoutes);   // nova rota esperada pelo front
app.use('/attack', attackRoutes);   // compatibilidade com rota antiga

// Outras rotas
app.use('/notifications', notificationRoutes);
app.use('/faction', factionRoutes);
app.use('/shop', shopRoutes);
app.use('/arsenal', arsenalRoutes);
app.use('/fuga', fugaRoutes);
app.use('/', briberyRoutes);
app.use('/', paymentRoutes);
app.use('/admin', adminRoutes);
app.use('/faction-invite', factionInviteRoutes);

// Tratamento de rota não encontrada
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Tratamento de erro interno
app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
  });
});

// Inicialização do servidor
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