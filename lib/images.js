// <img> z srcset dla zdjęć przetworzonych przez `npm run images`
// (lib/imageManifest.json). width/height to wymiary kadru - przeglądarka
// rezerwuje miejsce o właściwych proporcjach, zanim zdjęcie się wczyta.
const manifest = require('./imageManifest.json');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function meta(key) {
  const m = manifest[key];
  if (!m) throw new Error(`Brak zdjęcia "${key}" w lib/imageManifest.json - dopisz je w scripts/images.config.js i uruchom npm run images.`);
  return m;
}

function img(key, { sizes = '100vw', alt, className = '', priority = false } = {}) {
  const m = meta(key);
  const srcset = m.widths.map((w) => `/images/photos/${key}-${w}.webp ${w}w`).join(', ');
  const fallback = m.widths[Math.min(1, m.widths.length - 1)];
  const attrs = [
    `src="/images/photos/${key}-${fallback}.webp"`,
    `srcset="${srcset}"`,
    `sizes="${escape(sizes)}"`,
    `width="${m.w}"`,
    `height="${m.h}"`,
    `alt="${escape(alt === undefined ? m.alt : alt)}"`,
    'decoding="async"',
    priority ? 'fetchpriority="high"' : 'loading="lazy"',
    className ? `class="${escape(className)}"` : '',
  ];
  return `<img ${attrs.filter(Boolean).join(' ')}>`;
}

// Bezwzględny adres JPEG do og:image (tylko zdjęcia z og: true w konfiguracji).
function ogUrl(key, baseUrl) {
  const m = manifest[key];
  return m && m.og ? `${baseUrl}${m.og}` : null;
}

module.exports = { img, meta, ogUrl, escape };
