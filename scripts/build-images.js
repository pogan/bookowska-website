// Przetwarza zdjęcia z input_data/ (materiały klientki, poza repo) do
// public/images/photos: kadr wg scripts/images.config.js, automatyczny obrót wg
// EXIF, usunięcie metadanych (EXIF/GPS z telefonów nie trafia na stronę) i WebP
// w kilku szerokościach do srcset. Zapisuje lib/imageManifest.json (wymiary,
// szerokości, alt) - wynik commitujemy, serwer nie potrzebuje sharpa.
// Uruchomienie: npm run images  (źródła: IMAGES_SRC, domyślnie ./input_data)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const config = require('./images.config');

const ROOT = path.join(__dirname, '..');
const SRC = path.resolve(ROOT, process.env.IMAGES_SRC || 'input_data');
const OUT = path.join(ROOT, 'public', 'images', 'photos');
const MANIFEST = path.join(ROOT, 'lib', 'imageManifest.json');

const WIDTHS = [480, 960, 1600];
const WEBP = { quality: 78, effort: 5, smartSubsample: true };

function cropRegion(width, height, entry) {
  if (entry.region) return entry.region;
  if (!entry.aspect) return { left: 0, top: 0, width, height };
  const [aw, ah] = entry.aspect.split(':').map(Number);
  let cw = width;
  let ch = Math.round((width * ah) / aw);
  if (ch > height) {
    ch = height;
    cw = Math.round((height * aw) / ah);
  }
  const fx = entry.focusX ?? 0.5;
  const fy = entry.focusY ?? 0.5;
  const left = Math.min(Math.max(Math.round(fx * width - cw / 2), 0), width - cw);
  const top = Math.min(Math.max(Math.round(fy * height - ch / 2), 0), height - ch);
  return { left, top, width: cw, height: ch };
}

async function build(entry) {
  const file = path.join(SRC, entry.src);
  const meta = await sharp(file).metadata();
  // Orientacja EXIF 5-8 oznacza obrót o 90° - wymiary po autoobrocie są zamienione.
  const rotated = (meta.orientation || 1) >= 5;
  const width = rotated ? meta.height : meta.width;
  const height = rotated ? meta.width : meta.height;
  const region = cropRegion(width, height, entry);

  const widths = WIDTHS.filter((w) => w < region.width);
  if (region.width <= WIDTHS[WIDTHS.length - 1]) widths.push(region.width);
  else if (!widths.includes(WIDTHS[WIDTHS.length - 1])) widths.push(WIDTHS[WIDTHS.length - 1]);

  for (const w of widths) {
    await sharp(file)
      .rotate()
      .extract(region)
      .resize({ width: w, withoutEnlargement: true })
      .webp(WEBP)
      .toFile(path.join(OUT, `${entry.key}-${w}.webp`));
  }

  // JPEG do og:image (podgląd linku w social media) - tylko dla wybranych.
  if (entry.og) {
    await sharp(file)
      .rotate()
      .extract(region)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(path.join(OUT, `${entry.key}-og.jpg`));
  }

  return {
    w: region.width,
    h: region.height,
    widths,
    alt: entry.alt,
    ...(entry.credit ? { credit: entry.credit } : {}),
    ...(entry.og ? { og: `/images/photos/${entry.key}-og.jpg` } : {}),
  };
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`Brak katalogu ze źródłami: ${SRC} (ustaw IMAGES_SRC).`);
    process.exit(1);
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const manifest = {};
  for (const entry of config) {
    manifest[entry.key] = await build(entry);
    const m = manifest[entry.key];
    console.log(`${entry.key.padEnd(22)} ${m.w}×${m.h}  [${m.widths.join(', ')}]`);
  }
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  const total = fs.readdirSync(OUT).reduce((sum, f) => sum + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`Gotowe: ${Object.keys(manifest).length} zdjęć, ${(total / 1024 / 1024).toFixed(1)} MB w public/images/photos.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
