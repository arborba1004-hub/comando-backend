import app from './app.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

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