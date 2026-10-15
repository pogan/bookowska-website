// Koszyk trzymany w sesji: { [productId]: quantity }. Ceny i dostępność zawsze
// liczymy od nowa z bazy (summarize) - sesja przechowuje wyłącznie wybór klienta,
// nigdy kwoty.
const catalog = require('./catalog');

function raw(session) {
  return (session && session.cart) || {};
}

function save(session, cart) {
  if (Object.keys(cart).length === 0) delete session.cart;
  else session.cart = cart;
}

function toQuantity(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

// Zwraca komunikat o błędzie albo null.
function add(session, product, quantity) {
  if (!product || !product.available) return 'Tego produktu nie można już kupić.';
  const cart = { ...raw(session) };
  const current = cart[product.id] || 0;
  const wanted = current + Math.max(1, toQuantity(quantity));
  if (wanted > product.maxQuantity) {
    cart[product.id] = product.maxQuantity;
    save(session, cart);
    return product.unique
      ? 'To egzemplarz jedyny — jest już w koszyku.'
      : `Można zamówić najwyżej ${product.maxQuantity} szt.`;
  }
  cart[product.id] = wanted;
  save(session, cart);
  return null;
}

const validId = (id) => Number.isInteger(id) && id > 0;

function setQuantity(session, productId, quantity) {
  if (!validId(productId)) return;
  const cart = { ...raw(session) };
  const q = toQuantity(quantity);
  if (q <= 0) delete cart[productId];
  else cart[productId] = Math.min(q, catalog.MAX_PER_LINE);
  save(session, cart);
}

function remove(session, productId) {
  if (!validId(productId)) return;
  const cart = { ...raw(session) };
  delete cart[productId];
  save(session, cart);
}

function clear(session) {
  if (session) delete session.cart;
}

function count(session) {
  return Object.values(raw(session)).reduce((sum, q) => sum + q, 0);
}

// Pozycje z aktualnymi cenami. Produkty, które zniknęły z oferty albo się
// wyprzedały, są usuwane z koszyka, a ilości przycinane do dostępnych -
// `notices` mówi klientowi, co się zmieniło.
function summarize(session) {
  const cart = raw(session);
  const lines = [];
  const notices = [];
  let changed = false;
  const next = {};

  for (const [id, quantity] of Object.entries(cart)) {
    const product = catalog.getById(Number(id));
    if (!product || !product.available) {
      notices.push(`${product ? `„${product.name}”` : 'Jeden z produktów'} nie jest już dostępny i zniknął z koszyka.`);
      changed = true;
      continue;
    }
    let q = quantity;
    if (q > product.maxQuantity) {
      q = product.maxQuantity;
      notices.push(`„${product.name}”: dostępnych jest ${product.maxQuantity} szt. — ilość w koszyku została zmniejszona.`);
      changed = true;
    }
    next[id] = q;
    lines.push({ product, quantity: q, total: product.price * q });
  }
  if (changed && session) save(session, next);

  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  return { lines, subtotal, count: lines.reduce((s, l) => s + l.quantity, 0), notices };
}

module.exports = { add, setQuantity, remove, clear, count, summarize };
