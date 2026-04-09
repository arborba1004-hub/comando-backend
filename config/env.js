import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return String(value).trim();
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 3000),

  MONGO_URI: required('MONGO_URI'),
  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  JWT_SECRET: required('JWT_SECRET'),

  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  FRONTEND_URL: process.env.FRONTEND_URL || '*',

  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN || '',
  MP_PUBLIC_KEY: process.env.MP_PUBLIC_KEY || '',
};