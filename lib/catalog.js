// Odczyt katalogu sklepu. Produkt "dostępny" = aktywny i (bez limitu albo stock > 0).
const db = require('../db');

// Limit sztuk jednej pozycji w koszyku dla produktów bez stanu magazynowego (bony).
const MAX_PER_LINE = 10;

const stmts = {
  listActive: db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY sort, id'),
  bySlug: db.prepare('SELECT * FROM products WHERE slug = ? AND is_active = 1'),
  byId: db.prepare('SELECT * FROM products WHERE id = ?'),
};

function hydrate(row) {
  if (!row) return null;
  const maxQuantity = row.stock === null ? MAX_PER_LINE : Math.min(row.stock, MAX_PER_LINE);
  return {
    ...row,
    images: JSON.parse(row.images || '[]'),
    isActive: row.is_active === 1,
    maxQuantity,
    available: row.is_active === 1 && maxQuantity > 0,
    unique: row.stock === 1,
  };
}

function listActive() {
  return stmts.listActive.all().map(hydrate);
}

function getBySlug(slug) {
  return hydrate(stmts.bySlug.get(slug));
}

function getById(id) {
  return hydrate(stmts.byId.get(id));
}

module.exports = { MAX_PER_LINE, listActive, getBySlug, getById };
