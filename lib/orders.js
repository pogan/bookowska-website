// Cykl życia zamówienia:
//   pending --(płatność potwierdzona)--> paid
//   pending --(odrzucona / anulowana)--> failed / cancelled  (towar wraca na stan)
//   pending --(brak płatności przez PENDING_TTL_MINUTES)--> expired (towar wraca)
// Towar rezerwujemy (zdejmujemy ze stanu) już przy złożeniu zamówienia, bo
// większość rękodzieła to egzemplarze jedyne - dwie osoby nie mogą zapłacić za
// ten sam notes. Jedynym źródłem prawdy o płatności są zdarzenia od operatora
// (applyPaymentEvent), nigdy parametry w adresie powrotnym z bramki.
const crypto = require('crypto');
const db = require('../db');

const PENDING_TTL_MINUTES = 30;

const STATUS_LABELS = {
  pending: 'oczekuje na płatność',
  paid: 'opłacone',
  failed: 'płatność odrzucona',
  cancelled: 'płatność anulowana',
  expired: 'wygasło (brak płatności)',
};

class OrderError extends Error {}

const stmts = {
  productById: db.prepare('SELECT * FROM products WHERE id = ?'),
  reserve: db.prepare(
    'UPDATE products SET stock = stock - @quantity WHERE id = @id AND (stock IS NULL OR stock >= @quantity)',
  ),
  release: db.prepare('UPDATE products SET stock = stock + @quantity WHERE id = @id AND stock IS NOT NULL'),
  maxNumber: db.prepare("SELECT MAX(CAST(substr(number, 9) AS INTEGER)) AS n FROM orders WHERE number LIKE ?"),
  insertOrder: db.prepare(`
    INSERT INTO orders (number, token, status, customer_name, email, phone, shipping_method, shipping_cost,
                        shipping_address, parcel_locker, notes, subtotal, total, payment_provider, terms_accepted_at)
    VALUES (@number, @token, 'pending', @customer_name, @email, @phone, @shipping_method, @shipping_cost,
            @shipping_address, @parcel_locker, @notes, @subtotal, @total, @payment_provider, datetime('now'))
  `),
  insertItem: db.prepare(`
    INSERT INTO order_items (order_id, product_id, slug, name, unit_price, quantity)
    VALUES (@order_id, @product_id, @slug, @name, @unit_price, @quantity)
  `),
  byId: db.prepare('SELECT * FROM orders WHERE id = ?'),
  byToken: db.prepare('SELECT * FROM orders WHERE token = ?'),
  byNumber: db.prepare('SELECT * FROM orders WHERE number = ?'),
  byRef: db.prepare('SELECT * FROM orders WHERE payment_ref = ?'),
  items: db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id'),
  setRef: db.prepare('UPDATE orders SET payment_ref = ? WHERE id = ?'),
  stale: db.prepare(
    "SELECT id FROM orders WHERE status = 'pending' AND created_at < datetime('now', ?)",
  ),
  setStatus: db.prepare(`
    UPDATE orders SET status = @status,
      paid_at = CASE WHEN @status = 'paid' THEN datetime('now') ELSE paid_at END,
      closed_at = CASE WHEN @status IN ('failed', 'cancelled', 'expired') THEN datetime('now') ELSE closed_at END,
      stock_conflict = @stock_conflict
    WHERE id = @id
  `),
  insertEvent: db.prepare(`
    INSERT INTO payment_events (provider, event_id, order_id, status, payload)
    VALUES (@provider, @event_id, @order_id, @status, @payload)
    ON CONFLICT (provider, event_id) DO NOTHING
  `),
  recent: db.prepare(`
    SELECT o.*, (SELECT SUM(quantity) FROM order_items i WHERE i.order_id = o.id) AS item_count
    FROM orders o ORDER BY o.id DESC LIMIT ?
  `),
};

function warsawYear() {
  return new Intl.DateTimeFormat('en', { timeZone: 'Europe/Warsaw', year: 'numeric' }).format(new Date());
}

function nextNumber() {
  const year = warsawYear();
  const { n } = stmts.maxNumber.get(`BK-${year}-%`);
  return `BK-${year}-${String((n || 0) + 1).padStart(4, '0')}`;
}

function releaseStock(orderId) {
  for (const item of stmts.items.all(orderId)) {
    if (item.product_id) stmts.release.run({ id: item.product_id, quantity: item.quantity });
  }
}

// Ponowna rezerwacja dla płatności, która dotarła po wygaśnięciu/anulowaniu.
// Zwraca false, jeśli którejś pozycji zabrakło (zamówienie i tak jest opłacone -
// trzeba je wyjaśnić ręcznie, stąd stock_conflict).
function reserveAgain(orderId) {
  let ok = true;
  for (const item of stmts.items.all(orderId)) {
    if (!item.product_id) continue;
    if (stmts.reserve.run({ id: item.product_id, quantity: item.quantity }).changes === 0) ok = false;
  }
  return ok;
}

const expireStaleTx = db.transaction(() => {
  const rows = stmts.stale.all(`-${PENDING_TTL_MINUTES} minutes`);
  for (const { id } of rows) {
    releaseStock(id);
    stmts.setStatus.run({ id, status: 'expired', stock_conflict: 0 });
  }
  return rows.length;
});

function expireStale() {
  return expireStaleTx();
}

// lines: [{ productId, quantity }]; customer: { name, email, phone };
// shipping: { method, cost, address (obiekt|null), locker }.
// Ceny bierzemy z bazy w chwili składania zamówienia - nie z koszyka w sesji.
const createTx = db.transaction(({ lines, customer, shipping, notes, provider }) => {
  expireStaleTx();
  if (!lines.length) throw new OrderError('Koszyk jest pusty.');

  const items = [];
  for (const line of lines) {
    const p = stmts.productById.get(line.productId);
    if (!p || !p.is_active) throw new OrderError('Jeden z produktów nie jest już dostępny — sprawdź koszyk.');
    if (stmts.reserve.run({ id: p.id, quantity: line.quantity }).changes === 0) {
      throw new OrderError(
        p.stock === 0
          ? `„${p.name}” właśnie się wyprzedał.`
          : `„${p.name}”: dostępnych sztuk: ${p.stock}. Zmień ilość w koszyku.`,
      );
    }
    items.push({ product_id: p.id, slug: p.slug, name: p.name, unit_price: p.price, quantity: line.quantity });
  }

  const subtotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const order = {
    number: nextNumber(),
    token: crypto.randomBytes(16).toString('base64url'),
    customer_name: customer.name,
    email: customer.email,
    phone: customer.phone || null,
    shipping_method: shipping.method,
    shipping_cost: shipping.cost,
    shipping_address: shipping.address ? JSON.stringify(shipping.address) : null,
    parcel_locker: shipping.locker || null,
    notes: notes || null,
    subtotal,
    total: subtotal + shipping.cost,
    payment_provider: provider,
  };
  const { lastInsertRowid } = stmts.insertOrder.run(order);
  for (const item of items) stmts.insertItem.run({ ...item, order_id: lastInsertRowid });
  return stmts.byId.get(lastInsertRowid);
});

function createOrder(input) {
  return createTx(input);
}

function setPaymentRef(orderId, ref) {
  stmts.setRef.run(ref, orderId);
}

// Zdarzenie od operatora płatności: { provider, eventId, ref, status: 'paid' |
// 'failed' | 'cancelled', payload }. Idempotentne - ponowne dostarczenie tego
// samego eventId nic nie zmienia. Zwraca { order, changed, duplicate }.
const applyTx = db.transaction(({ provider, eventId, ref, status, payload }) => {
  const order = stmts.byRef.get(ref);
  const inserted = stmts.insertEvent.run({
    provider,
    event_id: eventId,
    order_id: order ? order.id : null,
    status,
    payload: payload ? JSON.stringify(payload) : null,
  });
  if (inserted.changes === 0) return { order, changed: false, duplicate: true };
  if (!order) return { order: null, changed: false, duplicate: false };

  if (status === 'paid') {
    if (order.status === 'paid') return { order, changed: false, duplicate: false };
    // Płatność po wygaśnięciu/anulowaniu: pieniądze są u nas, więc zamówienie jest
    // opłacone - próbujemy odzyskać rezerwację, a brak towaru oznaczamy flagą.
    const conflict = order.status === 'pending' ? false : !reserveAgain(order.id);
    stmts.setStatus.run({ id: order.id, status: 'paid', stock_conflict: conflict ? 1 : 0 });
    return { order: stmts.byId.get(order.id), changed: true, duplicate: false };
  }

  if (status === 'failed' || status === 'cancelled') {
    if (order.status !== 'pending') return { order, changed: false, duplicate: false };
    releaseStock(order.id);
    stmts.setStatus.run({ id: order.id, status, stock_conflict: 0 });
    return { order: stmts.byId.get(order.id), changed: true, duplicate: false };
  }

  return { order, changed: false, duplicate: false };
});

function applyPaymentEvent(event) {
  return applyTx(event);
}

// Atomowe "zajęcie" wysyłki e-maila - wysyłamy dokładnie raz, nawet przy
// zdublowanym powiadomieniu od operatora.
const EMAIL_COLUMNS = new Set(['customer_email_sent_at', 'studio_email_sent_at']);
function claimEmail(orderId, column) {
  if (!EMAIL_COLUMNS.has(column)) throw new Error(`Nieznana kolumna: ${column}`);
  return db.prepare(`UPDATE orders SET ${column} = datetime('now') WHERE id = ? AND ${column} IS NULL`).run(orderId)
    .changes === 1;
}

// Wysyłka się nie udała (albo SMTP nie jest skonfigurowany) - zdejmujemy znacznik,
// żeby panel nie pokazywał e-maila jako wysłanego.
function releaseEmailClaim(orderId, column) {
  if (!EMAIL_COLUMNS.has(column)) throw new Error(`Nieznana kolumna: ${column}`);
  db.prepare(`UPDATE orders SET ${column} = NULL WHERE id = ?`).run(orderId);
}

function withItems(order) {
  if (!order) return null;
  return {
    ...order,
    items: stmts.items.all(order.id),
    address: order.shipping_address ? JSON.parse(order.shipping_address) : null,
    statusLabel: STATUS_LABELS[order.status] || order.status,
  };
}

module.exports = {
  PENDING_TTL_MINUTES,
  STATUS_LABELS,
  OrderError,
  createOrder,
  setPaymentRef,
  applyPaymentEvent,
  expireStale,
  claimEmail,
  releaseEmailClaim,
  getByToken: (token) => withItems(stmts.byToken.get(token)),
  getByNumber: (number) => withItems(stmts.byNumber.get(number)),
  getByRef: (ref) => withItems(stmts.byRef.get(ref)),
  listRecent: (limit = 100) => stmts.recent.all(limit),
};
