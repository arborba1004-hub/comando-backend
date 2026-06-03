import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return mongoose.connection;

  mongoose.set('strictQuery', true);

  await mongoose.connect(env.MONGO_URI, {
    autoIndex: env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: Number(env.MONGO_MAX_POOL_SIZE || 20),
    minPoolSize: Number(env.MONGO_MIN_POOL_SIZE || 0),
  });

  isConnected = true;
  console.log('✅ Mongo conectado');

  mongoose.connection.on('error', (error) => {
    console.error('❌ Erro Mongo:', error);
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.warn('⚠️ Mongo desconectado');
  });

  return mongoose.connection;
}
