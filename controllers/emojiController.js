import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export async function uploadEmoji(req, res) {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Arquivo não enviado' });
    }

    const id = Date.now().toString();

    const outputPath = path.join(
      process.cwd(),
      'public/emojis',
      `${id}.png`
    );

    // (placeholder de remove background — substitui depois se quiser API real)
    await sharp(file.path)
      .resize(256, 256, { fit: 'inside' })
      .png()
      .toFile(outputPath);

    fs.unlinkSync(file.path);

    const emoji = {
      id,
      label: file.originalname,
      shortcode: `:${id}:`,
      imageUrl: `/emojis/${id}.png`,
    };

    return res.status(201).json(emoji);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao processar emoji' });
  }
}