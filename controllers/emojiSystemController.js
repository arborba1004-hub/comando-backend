import fs from 'fs';
import path from 'path';

const DATA_FILE = path.resolve('data/emojis.json');

function readEmojis() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeEmojis(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 📌 Jogadores só leem
export function getEmojis(req, res) {
  const emojis = readEmojis();
  res.json(emojis);
}

// 📌 VOCÊ adiciona emoji
export function addEmoji(req, res) {
  const { id, label, imageUrl, shortcode } = req.body;

  if (!id || !imageUrl) {
    return res.status(400).json({ error: 'Dados inválidos' });
  }

  const emojis = readEmojis();

  emojis.push({
    id,
    label,
    imageUrl,
    shortcode,
  });

  writeEmojis(emojis);

  return res.status(201).json({ ok: true });
}