import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) {
    return mongoose.connection;
  }

  try {
    await mongoose.connect(env.MONGO_URI);
    isConnected = true;

    console.log('✅ MongoDB conectado com sucesso');

    mongoose.connection.on('error', (error) => {
      console.error('❌ Erro na conexão MongoDB:', error);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB desconectado');
      isConnected = false;
    });

    return mongoose.connection;
  } catch (error) {
    console.error('❌ Falha ao conectar no MongoDB:', error);
    throw error;
  }
}
