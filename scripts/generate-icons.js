// Buduje ikony rastrowe ze znaku z public/images/logo-mark.svg (wektor z
// oryginalnego pliku .ai): favicon.ico (16/32/48), apple-touch-icon, ikony PWA
// z site.webmanifest oraz domyślny obraz og:image 1200×630. Wynik commitujemy
// (wzorzec "zbuduj raz" jak scripts/build-images.js). Uruchomienie: npm run icons
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const MARK = fs.readFileSync(path.join(PUBLIC, 'images', 'logo-mark.svg'), 'utf8').replace(/currentColor/g, '#000');
const LOGO = fs.readFileSync(path.join(PUBLIC, 'images', 'logo.svg'), 'utf8').replace(/currentColor/g, '#000');

// Znak wyśrodkowany na białym kwadracie; `scale` = wysokość znaku / bok ikony.
async function squareIcon(size, scale) {
  const markH = Math.round(size * scale);
  const mark = await sharp(Buffer.from(MARK), { density: 600 }).resize({ height: markH }).png().toBuffer();
  const { width: markW } = await sharp(mark).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: mark, left: Math.round((size - markW) / 2), top: Math.round((size - markH) / 2) }])
    .png()
    .toBuffer();
}

// Kontener ICO z osadzonymi PNG (format obsługiwany od Windows Vista i przez
// wszystkie przeglądarki) - sharp nie zapisuje ICO.
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function ogImage() {
  const W = 1200;
  const H = 630;
  const photo = await sharp(path.join(PUBLIC, 'images', 'photos', 'dyplom-harmonijka-1600.webp'))
    .resize({ width: W / 2, height: H, fit: 'cover', position: 'centre' })
    .grayscale()
    .toBuffer();
  const logoH = 330;
  const logo = await sharp(Buffer.from(LOGO), { density: 600 }).resize({ height: logoH }).png().toBuffer();
  const { width: logoW } = await sharp(logo).metadata();
  // Cienka linia podziału jak na arkuszu rysunku.
  const rule = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="2" height="${H}"><rect width="2" height="${H}" fill="#000"/></svg>`);
  return sharp({ create: { width: W, height: H, channels: 3, background: '#ffffff' } })
    .composite([
      { input: photo, left: 0, top: 0 },
      { input: rule, left: W / 2, top: 0 },
      { input: logo, left: Math.round(W / 2 + (W / 2 - logoW) / 2), top: Math.round((H - logoH) / 2) },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

async function main() {
  const write = (rel, buf) => {
    fs.writeFileSync(path.join(PUBLIC, rel), buf);
    console.log(`${rel} (${buf.length} B)`);
  };

  const ico = [];
  for (const size of [16, 32, 48]) ico.push({ size, data: await squareIcon(size, 0.9) });
  write('favicon.ico', buildIco(ico));
  write('apple-touch-icon.png', await squareIcon(180, 0.72));
  write('icon-192.png', await squareIcon(192, 0.72));
  // Wariant "maskable": Android przycina ikonę do koła - znak w bezpiecznej strefie (80%).
  write('icon-512.png', await squareIcon(512, 0.56));
  write('images/og-cover.jpg', await ogImage());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
