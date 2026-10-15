// Adresy stron z polskich nazw: "Oprawa półpłócienna" -> "oprawa-polplocienna".
const PL = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

module.exports = { slugify, SLUG_RE };
