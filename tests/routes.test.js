const { startServer, client } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');

let srv;
test.before(async () => {
  srv = await startServer();
});
test.after(() => srv.close());

const PUBLIC = [
  '/',
  '/o-mnie',
  '/warsztaty',
  '/warsztaty/notes-w-twardej-oprawie',
  '/warsztaty/warsztaty-dla-grup',
  '/sklep',
  '/sklep/notes-marmurkowy-zolc-i-grafit',
  '/kontakt',
  '/regulamin',
  '/polityka-prywatnosci',
];

test('strony publiczne: 200, canonical, JSON-LD, nagłówki bezpieczeństwa', async () => {
  const c = client(srv.base);
  for (const p of PUBLIC) {
    const res = await c.get(p);
    assert.equal(res.status, 200, p);
    assert.match(res.text, /<link rel="canonical" href="http:\/\/bookowska\.test/, `${p}: canonical`);
    assert.match(res.text, /application\/ld\+json/, `${p}: JSON-LD`);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline/, `${p}: CSP bez unsafe-inline`);
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
  // Zwykłe przeglądanie nie zakłada sesji (żadnych ciasteczek).
  assert.equal(c.hasSession(), false);
});

test('robots.txt blokuje indeksowanie przed podpięciem domeny; sitemap i llms.txt', async () => {
  const c = client(srv.base);
  assert.match((await c.get('/robots.txt')).text, /Disallow: \//);
  const sitemap = (await c.get('/sitemap.xml')).text;
  assert.match(sitemap, /<loc>http:\/\/bookowska\.test\/sklep\/bon-podarunkowy-na-warsztaty<\/loc>/);
  assert.match((await c.get('/llms.txt')).text, /^# Bookowska/);
});

test('404 dla nieznanych adresów i slugów', async () => {
  const c = client(srv.base);
  for (const p of ['/nie-ma', '/sklep/nie-ma', '/warsztaty/nie-ma', '/zamowienie/zly-token', '/platnosc/mock/zly']) {
    assert.equal((await c.get(p)).status, 404, p);
  }
});

test('POST z obcej strony (Origin) jest odrzucany', async () => {
  const c = client(srv.base);
  const res = await c.post('/koszyk/dodaj', { product: '1' }, { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  const noOrigin = await c.post('/koszyk/dodaj', { product: '1' }, { origin: null });
  assert.equal(noOrigin.status, 403);
});

test('zapis na warsztaty: walidacja, zapis w bazie, pole-pułapka', async () => {
  const c = client(srv.base);
  const session = db
    .prepare("SELECT s.id, w.slug FROM workshop_sessions s JOIN workshops w ON w.id = s.workshop_id WHERE s.starts_at > ? ORDER BY s.starts_at LIMIT 1")
    .get(new Date().toISOString());
  const url = `/warsztaty/${session.slug}/zapis?termin=${session.id}`;

  const form = await c.get(url);
  assert.equal(form.status, 200);
  assert.match(form.text, /name="website"/);

  const invalid = await c.post(url, { name: 'A', email: 'zly', participants: '0' });
  assert.equal(invalid.status, 422);
  assert.match(invalid.text, /Podaj poprawny adres e-mail/);

  const count = () => db.prepare('SELECT COUNT(*) AS n FROM workshop_signups').get().n;
  const before = count();
  const spam = await c.post(url, { name: 'Bot Botowski', email: 'bot@example.com', participants: '1', website: 'http://spam' });
  assert.equal(spam.status, 303);
  assert.equal(count(), before, 'pole-pułapka: nic nie zapisano');

  const ok = await c.post(url, { name: 'Ola Testowa', email: 'ola@example.com', phone: '500 600 700', participants: '2', message: 'Do zobaczenia!' });
  assert.equal(ok.status, 303);
  assert.equal(ok.location, `/warsztaty/${session.slug}/zapis/dziekuje?termin=${session.id}`);
  const row = db.prepare('SELECT * FROM workshop_signups ORDER BY id DESC LIMIT 1').get();
  assert.equal(row.email, 'ola@example.com');
  assert.equal(row.participants, 2);
  assert.equal(row.session_id, session.id);
  assert.equal((await c.get(ok.location)).status, 200);
});

test('zakup: koszyk -> zamówienie -> symulowana płatność -> opłacone, koszyk pusty', async () => {
  const c = client(srv.base);
  const product = db.prepare("SELECT * FROM products WHERE slug = 'notes-marmurkowy-zolc-i-grafit'").get();
  db.prepare('UPDATE products SET stock = 1 WHERE id = ?').run(product.id);

  const added = await c.post('/koszyk/dodaj', { product: String(product.id), quantity: '1' });
  assert.equal(added.status, 303);
  assert.ok(c.hasSession());
  const cart = await c.get('/koszyk');
  assert.match(cart.text, /Notes marmurkowy — żółć i grafit/);
  assert.match(cart.text, /Koszyk <span class="cart-count"[^>]*>\[1\]/);

  const missing = await c.post('/zamowienie', { name: 'Anna Testowa', email: 'anna@example.com', shipping: 'paczkomat' });
  assert.equal(missing.status, 422);
  assert.match(missing.text, /Podaj kod paczkomatu/);
  assert.match(missing.text, /Zaakceptuj regulamin/);

  const placed = await c.post('/zamowienie', {
    name: 'Anna Testowa',
    email: 'anna@example.com',
    phone: '500600700',
    shipping: 'paczkomat',
    locker: 'sop01m',
    terms: 'on',
  });
  assert.equal(placed.status, 303);
  assert.match(placed.location, /^\/platnosc\/mock\/mock_[0-9a-f]+$/);
  const order = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
  assert.equal(order.status, 'pending');
  assert.equal(order.parcel_locker, 'SOP01M');
  assert.equal(order.total, product.price + 1699);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id).stock, 0);

  const gateway = await c.get(placed.location);
  assert.equal(gateway.status, 200);
  assert.match(gateway.text, /Płatność za zamówienie BK-/);

  const paid = await c.post(placed.location, { result: 'paid' });
  assert.equal(paid.status, 303);
  assert.equal(paid.location, `/zamowienie/${order.token}`);
  const status = await c.get(paid.location);
  assert.match(status.text, /opłacone/);
  assert.match(status.text, /Koszyk <span class="cart-count"[^>]*>\[0\]/);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id).status, 'paid');

  // Opłaconego zamówienia nie da się "opłacić" ponownie przez bramkę.
  assert.equal((await c.get(placed.location)).status, 303);
});

test('panel: logowanie wymagane, podstrony przekierowują', async () => {
  const c = client(srv.base);
  const login = await c.get('/admin');
  assert.equal(login.status, 200);
  assert.match(login.text, /Logowanie/);
  assert.equal(login.headers.get('cache-control'), 'no-store');
  const sub = await c.get('/admin/zamowienia/BK-2026-0001');
  assert.equal(sub.status, 302);
  assert.equal(sub.location, '/admin');
  // Bez kluczy Google logowanie zwraca czytelne 503 zamiast błędu.
  assert.equal((await c.get('/auth/google')).status, 503);
});
