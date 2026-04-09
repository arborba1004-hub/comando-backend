import mongoose from 'mongoose';
import { env } from './env.js';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return mongoose.connection;

  mongoose.set('strictQuery', true);

  await mongoose.connect(env.MONGO_URI, {
    autoIndex: true,
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