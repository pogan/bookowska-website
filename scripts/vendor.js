// Kopiuje zasoby front-endu z node_modules do public/vendor, żeby serwować je z
// własnego serwera zamiast z CDN (bez wycieku IP odwiedzających do Google Fonts /
// jsDelivr - RODO; CSP może zostać przy 'self'). Wynik commitujemy, więc na
// serwerze wystarczają zależności produkcyjne (npm ci --omit=dev).
// Uruchom po zmianie wersji Bootstrapa / H5BP / czcionek / ikon: npm run vendor
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const NM = path.join(ROOT, 'node_modules');
const OUT = path.join(ROOT, 'public', 'vendor');

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('  ', path.relative(ROOT, dest));
}

fs.rmSync(OUT, { recursive: true, force: true });

// Bootstrap (CSS + bundle z Popperem - potrzebny tylko collapse menu mobilnego).
copy(path.join(NM, 'bootstrap/dist/css/bootstrap.min.css'), path.join(OUT, 'bootstrap/bootstrap.min.css'));
copy(path.join(NM, 'bootstrap/dist/js/bootstrap.bundle.min.js'), path.join(OUT, 'bootstrap/bootstrap.bundle.min.js'));

// HTML5 Boilerplate: bazowe style, klasy pomocnicze i style druku (main.css).
copy(path.join(NM, 'html5-boilerplate/dist/css/style.css'), path.join(OUT, 'h5bp/style.css'));

// Czcionki IBM Plex: podzbiory latin + latin-ext (polskie znaki diakrytyczne są
// w latin-ext). Reguły @font-face (z unicode-range) bierzemy z arkuszy
// @fontsource, przepisując adresy plików na /vendor/fonts.
const FONTS = [
  { pkg: 'ibm-plex-sans', styles: ['300', '400', '400-italic', '500', '600'] },
  { pkg: 'ibm-plex-mono', styles: ['400', '500'] },
];
const SUBSETS = ['latin', 'latin-ext'];
const faces = [];
for (const { pkg, styles } of FONTS) {
  for (const style of styles) {
    const css = fs.readFileSync(path.join(NM, '@fontsource', pkg, `${style}.css`), 'utf8');
    for (const block of css.match(/\/\*[^*]*\*\/\s*@font-face\s*{[^}]*}/g) || []) {
      const subset = (block.match(/\/\*\s*([\w-]+)\s*\*\//) || [])[1];
      // "ibm-plex-sans-latin-ext-400-normal" -> "latin-ext"
      const subsetName = subset && subset.replace(`${pkg}-`, '').replace(/-\d+-(normal|italic)$/, '');
      if (!SUBSETS.includes(subsetName)) continue;
      const woff2 = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
      copy(path.join(NM, '@fontsource', pkg, 'files', woff2), path.join(OUT, 'fonts', woff2));
      faces.push(
        block
          .replace(/src:[^;]+;/, `src: url(/vendor/fonts/${woff2}) format('woff2');`)
          .replace(/\n\s*\n/g, '\n'),
      );
    }
  }
}
fs.writeFileSync(path.join(OUT, 'fonts', 'fonts.css'), faces.join('\n') + '\n');
console.log('   public/vendor/fonts/fonts.css');

// Sprite SVG z kilkunastu ikon Bootstrap Icons zamiast całego fontu ikon (~130 kB).
// Użycie: <svg class="icon"><use href="/images/icons.svg#i-bag"></use></svg>
const ICONS = [
  'arrow-left', 'arrow-right', 'arrow-up-right', 'bag', 'check-lg', 'dash-lg', 'envelope',
  'facebook', 'geo-alt', 'google', 'instagram', 'plus-lg', 'telephone', 'x-lg',
];
const symbols = ICONS.map((name) => {
  const svg = fs.readFileSync(path.join(NM, 'bootstrap-icons/icons', `${name}.svg`), 'utf8');
  const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return `<symbol id="i-${name}" viewBox="${viewBox}">${inner}</symbol>`;
});
const sprite = `<svg xmlns="http://www.w3.org/2000/svg">\n<!-- Bootstrap Icons (MIT) - npm run vendor -->\n${symbols.join('\n')}\n</svg>\n`;
fs.writeFileSync(path.join(ROOT, 'public', 'images', 'icons.svg'), sprite);
console.log('   public/images/icons.svg');

console.log('Gotowe: zasoby skopiowane do public/vendor.');
