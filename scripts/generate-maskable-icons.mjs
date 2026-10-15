import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOGO_PATH = path.resolve(__dirname, '../public/images/logo_simbolo.webp');
const SIZES = [512, 192];

// O logo inteiro cabe no círculo de raio 0,40 × lado (zona segura do maskable),
// com 8% de folga: a diagonal do logo mede no máximo 0,80 × 0,92 do lado.
const SAFE_DIAMETER = 0.8 * 0.92;

const logo = await sharp(LOGO_PATH).trim().toBuffer({ resolveWithObject: true });
const { width, height } = logo.info;

for (const size of SIZES) {
  const scale = (SAFE_DIAMETER * size) / Math.hypot(width, height);
  const resized = await sharp(logo.data)
    .resize(Math.round(width * scale), Math.round(height * scale))
    .toBuffer();

  const out = path.resolve(__dirname, `../public/icons/icon-maskable-${size}x${size}.png`);
  await sharp({ create: { width: size, height: size, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: resized, gravity: 'center' }])
    .flatten({ background: '#FFFFFF' })
    .png()
    .toFile(out);
  console.log(`Maskable icon generated: ${out}`);
}
