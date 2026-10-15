require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const { syncAll } = require('../lib/seed');
const orders = require('../lib/orders');

syncAll();

const product = (slug) => db.prepare('SELECT * FROM products WHERE slug = ?').get(slug);
const UNIQUE = 'notes-marmurkowy-granat-i-czerwien';
const VOUCHER = 'bon-podarunkowy-na-warsztaty';

function place(slug, quantity = 1) {
  const p = product(slug);
  return orders.createOrder({
    lines: [{ productId: p.id, quantity }],
    customer: { name: 'Anna Testowa', email: 'anna@example.com', phone: '500600700' },
    shipping: { method: 'paczkomat', cost: 1699, address: null, locker: 'SOP01M' },
    notes: '',
    provider: 'mock',
  });
}

let seq = 0;
function pay(order, status, eventId = `evt_${++seq}`) {
  if (!order.payment_ref) {
    orders.setPaymentRef(order.id, `ref_${order.id}`);
    order.payment_ref = `ref_${order.id}`;
  }
  return orders.applyPaymentEvent({ provider: 'mock', eventId, ref: order.payment_ref, status });
}

const resetStock = (slug, stock) => db.prepare('UPDATE products SET stock = ? WHERE slug = ?').run(stock, slug);

test('zamówienie rezerwuje egzemplarz jedyny - drugie zamówienie się nie uda', () => {
  resetStock(UNIQUE, 1);
  const first = place(UNIQUE);
  assert.equal(first.status, 'pending');
  assert.equal(product(UNIQUE).stock, 0);
  assert.throws(() => place(UNIQUE), orders.OrderError);
  // Nieudana próba nie może zostawić połowicznego zamówienia ani zmienić stanu.
  assert.equal(product(UNIQUE).stock, 0);
});

test('kwoty liczone z cen w bazie, numer zamówienia rośnie', () => {
  const a = place(VOUCHER, 2);
  const b = place(VOUCHER, 1);
  assert.equal(a.subtotal, product(VOUCHER).price * 2);
  assert.equal(a.total, a.subtotal + 1699);
  const n = (o) => Number(o.number.split('-')[2]);
  assert.equal(n(b), n(a) + 1);
  assert.match(a.number, /^BK-\d{4}-\d{4}$/);
});

test('płatność potwierdzona raz - zdublowane powiadomienie niczego nie zmienia', () => {
  resetStock(UNIQUE, 1);
  const order = place(UNIQUE);
  const first = pay(order, 'paid', 'evt_dup');
  assert.equal(first.changed, true);
  assert.equal(first.order.status, 'paid');
  const again = pay(order, 'paid', 'evt_dup');
  assert.equal(again.duplicate, true);
  assert.equal(again.changed, false);
  // Spóźnione "failed" po opłaceniu nie cofa zamówienia.
  const late = pay(order, 'failed');
  assert.equal(late.changed, false);
  assert.equal(orders.getByToken(order.token).status, 'paid');
  assert.equal(product(UNIQUE).stock, 0);
});

test('odrzucona płatność zwraca towar na stan', () => {
  resetStock(UNIQUE, 1);
  const order = place(UNIQUE);
  assert.equal(product(UNIQUE).stock, 0);
  const res = pay(order, 'failed');
  assert.equal(res.order.status, 'failed');
  assert.equal(product(UNIQUE).stock, 1);
});

test('nieopłacone zamówienie wygasa i zwalnia rezerwację', () => {
  resetStock(UNIQUE, 1);
  const order = place(UNIQUE);
  db.prepare("UPDATE orders SET created_at = datetime('now', '-31 minutes') WHERE id = ?").run(order.id);
  assert.equal(orders.expireStale(), 1);
  assert.equal(orders.getByToken(order.token).status, 'expired');
  assert.equal(product(UNIQUE).stock, 1);
});

test('płatność po wygaśnięciu, gdy towaru już nie ma - opłacone z flagą konfliktu', () => {
  resetStock(UNIQUE, 1);
  const late = place(UNIQUE);
  db.prepare("UPDATE orders SET created_at = datetime('now', '-31 minutes') WHERE id = ?").run(late.id);
  orders.expireStale();
  const other = place(UNIQUE);
  pay(other, 'paid');
  const res = pay(late, 'paid');
  assert.equal(res.order.status, 'paid');
  assert.equal(res.order.stock_conflict, 1);
  assert.equal(product(UNIQUE).stock, 0);
});

test('claimEmail działa dokładnie raz, release pozwala ponowić', () => {
  const order = place(VOUCHER);
  assert.equal(orders.claimEmail(order.id, 'customer_email_sent_at'), true);
  assert.equal(orders.claimEmail(order.id, 'customer_email_sent_at'), false);
  orders.releaseEmailClaim(order.id, 'customer_email_sent_at');
  assert.equal(orders.claimEmail(order.id, 'customer_email_sent_at'), true);
  assert.throws(() => orders.claimEmail(order.id, 'status'));
});
