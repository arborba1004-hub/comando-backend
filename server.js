import express from 'express';
import { createServer } from 'http';
import { initSocket } from './services/socket.js';
import cors from 'cors';

import { env } from './config/env.js';
import { connectDB } from './config/db.js';

// Import das rotas
import authRoutes from './routes/authRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import barracoRoutes from './routes/barracoRoutes.js';
import playersRoutes from './routes/playersRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import emojiRoutes from './routes/emojiRoutes.js';
import emojiSystemRoutes from './routes/emojiSystemRoutes.js';
import laundryRoutes from './routes/laundryRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import briberyRoutes from './routes/briberyRoutes.js';
import trainingRoutes from './routes/trainingRoutes.js';
import gangRoutes from './routes/gangRoutes.js';
import gangWarRoutes from './routes/gangWarRoutes.js';
import attackRoutes from './routes/attackRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import factionRoutes from './routes/factionRoutes.js';
import shopRoutes from './routes/shopRoutes.js';
import arsenalRoutes from './routes/arsenalRoutes.js';
import fugaRoutes from './routes/fugaRoutes.js';
import convoyRoutes from './routes/convoyRoutes.js';
import mercadoPagoRoutes from './routes/mercadoPagoRoutes.js';
import azideiaRoutes from './routes/azideiaRoutes.js';
import qgEventRoutes from './routes/qgEventRoutes.js';
import { runQgEventSchedulerTick } from './controllers/qgEventController.js';
import { ensureAzideiaSystemHealth } from './controllers/azideiaController.js';

import adminRoutes from './routes/adminRoutes.js';
import factionHelpRoutes from './routes/factionHelpRoutes.js';
import factionInviteRoutes from './routes/factionInviteRoutes.js';

const AZIDEIA_HEALTH_INTERVAL_MS = 30 * 1000;
const QG_EVENT_TICK_INTERVAL_MS = 30 * 1000;

const app = express();
const server = createServer(app);
initSocket(server);

// Configuração de CORS
// O jogo pode rodar no domínio final e também no preview/publicação do Wix Vibe.
// Se o Render estiver preso a apenas um FRONTEND_URL, o clique de compra real falha no browser
// antes mesmo de chegar no backend.
function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (env.FRONTEND_URL === '*') return true;

  const cleanOrigin = normalizeOrigin(origin);
  const configured = String(env.FRONTEND_URL || '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);

  if (configured.includes(cleanOrigin)) return true;

  // Preview/publicação padrão do Wix Vibe. Ex.: https://arborba81.wix-vibe-site.com
  if (/^https:\/\/[a-z0-9-]+\.wix-vibe-site\.com$/i.test(cleanOrigin)) return true;

  // Domínio final usado no teste da loja.
  if (cleanOrigin === 'https://papoplay.com' || cleanOrigin === 'https://www.papoplay.com') return true;

  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error(`Origem CORS não permitida: ${origin}`));
    },
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
app.use('/barraco', barracoRoutes);
app.use('/players', playersRoutes);
app.use('/chat', chatRoutes);
app.use('/emojis', emojiSystemRoutes);
app.use('/emoji', emojiRoutes);
app.use('/faction-help', factionHelpRoutes);
app.use('/laundry', laundryRoutes);
app.use('/game', gameRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/gang', gangRoutes);

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
app.use('/convoys', convoyRoutes);
app.use('/payments', mercadoPagoRoutes);
app.use('/azideia', azideiaRoutes);
app.use('/qg-event', qgEventRoutes);
app.use('/', briberyRoutes);

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

function runSafeBackgroundTask(label, task) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      console.error(`❌ ${label}:`, error?.message || error);
    });
}

function startSchedulers() {
  // Não bloqueia cold start do Render. O /health sobe primeiro; manutenção roda logo depois.
  setTimeout(() => {
    runSafeBackgroundTask('Azidéia health inicial', ensureAzideiaSystemHealth);
    runSafeBackgroundTask('QG scheduler inicial', runQgEventSchedulerTick);
  }, 1500);

  setInterval(() => {
    runSafeBackgroundTask('Azidéia health interval', ensureAzideiaSystemHealth);
  }, AZIDEIA_HEALTH_INTERVAL_MS);

  setInterval(() => {
    runSafeBackgroundTask('QG scheduler interval', runQgEventSchedulerTick);
  }, QG_EVENT_TICK_INTERVAL_MS);
}

// Inicialização do servidor
async function startServer() {
  try {
    await connectDB();

    server.listen(env.PORT, () => {
      console.log('Servidor rodando com WebSocket');
      startSchedulers();
    });
  } catch (error) {
    console.error('❌ Não foi possível iniciar o servidor:', error);
    process.exit(1);
  }
}

startServer();

export default app;