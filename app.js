import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRoutes from './routes/authRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import playersRoutes from './routes/playersRoutes.js';

const app = express();

const corsOptions = {
  origin: env.FRONTEND_URL === '*' ? true : [env.FRONTEND_URL],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'Servidor rodando',
    environment: env.NODE_ENV,
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/auth', authRoutes);
app.use('/player', playerRoutes);
app.use('/players', playersRoutes);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Rota não encontrada',
  });
});

app.use((error, req, res, next) => {
  console.error('💥 Erro interno:', error);

  res.status(error.statusCode || 500).json({
    ok: false,
    error: error.message || 'Erro interno do servidor',
  });
});

export default app;
