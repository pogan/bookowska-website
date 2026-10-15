// Rysunek techniczny produktu (inline SVG): rzut z przodu i z boku, linie
// wymiarowe z zakończeniami ukośnymi, osie symetrii (linia punktowa) i
// kreskowanie płóciennego grzbietu dla opraw półpłóciennych. Wymiary w mm
// pochodzą z bazy (liczby całkowite), więc do SVG trafiają tylko liczby.
// Kolory i kroje nadaje CSS (.drawing w public/css/custom.css).

const n = (v) => Math.round(v * 10) / 10;

function hDim(x1, x2, y, label, extFrom) {
  const t = 4;
  // Wymiar węższy niż etykieta: opis za linią, jak na rysunkach warsztatowych.
  const narrow = x2 - x1 < 26;
  const text = narrow
    ? `<text class="drw-label" x="${n(x2 + 9)}" y="${n(y + 4)}" text-anchor="start">${label}</text>`
    : `<text class="drw-label" x="${n((x1 + x2) / 2)}" y="${n(y - 6)}" text-anchor="middle">${label}</text>`;
  return [
    `<line class="drw-ext" x1="${n(x1)}" y1="${n(extFrom + 4)}" x2="${n(x1)}" y2="${n(y + 6)}"/>`,
    `<line class="drw-ext" x1="${n(x2)}" y1="${n(extFrom + 4)}" x2="${n(x2)}" y2="${n(y + 6)}"/>`,
    `<line class="drw-dim" x1="${n(x1 - 6)}" y1="${n(y)}" x2="${n(x2 + 6)}" y2="${n(y)}"/>`,
    `<line class="drw-tick" x1="${n(x1 - t)}" y1="${n(y + t)}" x2="${n(x1 + t)}" y2="${n(y - t)}"/>`,
    `<line class="drw-tick" x1="${n(x2 - t)}" y1="${n(y + t)}" x2="${n(x2 + t)}" y2="${n(y - t)}"/>`,
    text,
  ].join('');
}

function vDim(y1, y2, x, label, extFrom) {
  const t = 4;
  const cy = (y1 + y2) / 2;
  return [
    `<line class="drw-ext" x1="${n(extFrom - 4)}" y1="${n(y1)}" x2="${n(x - 6)}" y2="${n(y1)}"/>`,
    `<line class="drw-ext" x1="${n(extFrom - 4)}" y1="${n(y2)}" x2="${n(x - 6)}" y2="${n(y2)}"/>`,
    `<line class="drw-dim" x1="${n(x)}" y1="${n(y1 - 6)}" x2="${n(x)}" y2="${n(y2 + 6)}"/>`,
    `<line class="drw-tick" x1="${n(x - t)}" y1="${n(y1 + t)}" x2="${n(x + t)}" y2="${n(y1 - t)}"/>`,
    `<line class="drw-tick" x1="${n(x - t)}" y1="${n(y2 + t)}" x2="${n(x + t)}" y2="${n(y2 - t)}"/>`,
    `<text class="drw-label" x="${n(x - 7)}" y="${n(cy)}" text-anchor="middle" transform="rotate(-90 ${n(x - 7)} ${n(cy)})">${label}</text>`,
  ].join('');
}

// product: { slug, width_mm, height_mm, depth_mm, binding }
function productDrawing(product) {
  const w = Number(product.width_mm);
  const h = Number(product.height_mm);
  const d = product.depth_mm ? Number(product.depth_mm) : 0;
  if (!w || !h) return '';

  const scale = Math.min(220 / h, 260 / w);
  const W = w * scale;
  const H = h * scale;
  const D = d ? Math.max(d * scale, 5) : 0;
  const x0 = 56;
  const y0 = 24;
  const sideX = x0 + W + 48;
  const width = d ? sideX + D + 40 : x0 + W + 28;
  const height = y0 + H + 52;
  const id = `hatch-${String(product.slug).replace(/[^a-z0-9-]/gi, '')}`;
  const halfCloth = /półpłócien/i.test(product.binding || '');
  const spine = W * 0.22;

  const parts = [
    `<svg class="drawing" viewBox="0 0 ${n(width)} ${n(height)}" role="img" aria-label="Rysunek wymiarowy: ${w} × ${h}${d ? ` × ${d}` : ''} mm">`,
    `<defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="drw-hatch" x1="0" y1="0" x2="0" y2="6"/></pattern></defs>`,
    // Rzut z przodu.
    halfCloth ? `<rect x="${n(x0)}" y="${n(y0)}" width="${n(spine)}" height="${n(H)}" fill="url(#${id})"/>` : '',
    halfCloth ? `<line class="drw-edge-thin" x1="${n(x0 + spine)}" y1="${n(y0)}" x2="${n(x0 + spine)}" y2="${n(y0 + H)}"/>` : '',
    `<rect class="drw-edge" x="${n(x0)}" y="${n(y0)}" width="${n(W)}" height="${n(H)}"/>`,
    `<line class="drw-axis" x1="${n(x0 + W / 2)}" y1="${n(y0 - 10)}" x2="${n(x0 + W / 2)}" y2="${n(y0 + H + 10)}"/>`,
    `<line class="drw-axis" x1="${n(x0 - 10)}" y1="${n(y0 + H / 2)}" x2="${n(x0 + W + 10)}" y2="${n(y0 + H / 2)}"/>`,
    hDim(x0, x0 + W, y0 + H + 30, w, y0 + H),
    vDim(y0, y0 + H, x0 - 30, h, x0),
  ];
  if (d) {
    // Rzut z boku: grzbiet o grubości bloku.
    parts.push(
      `<rect class="drw-edge" x="${n(sideX)}" y="${n(y0)}" width="${n(D)}" height="${n(H)}"/>`,
      `<line class="drw-axis" x1="${n(sideX + D / 2)}" y1="${n(y0 - 10)}" x2="${n(sideX + D / 2)}" y2="${n(y0 + H + 10)}"/>`,
      hDim(sideX, sideX + D, y0 + H + 30, d, y0 + H),
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

module.exports = { productDrawing };
