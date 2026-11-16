const { startServer, client, sessionCookie } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');

let srv;
test.before(async () => {
  srv = await startServer();
});
test.after(() => srv.close());

const BROWSER = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  'accept-language': 'pl-PL,pl;q=0.9',
};
const pageviews = () => db.prepare('SELECT path, is_bot FROM vk_pageviews ORDER BY id').all();
const settle = () => new Promise((r) => setTimeout(r, 20));

test('/healthz w formacie vamude-kit, z kontrolą bazy', async () => {
  const res = await client(srv.base).get('/healthz');
  assert.equal(res.status, 200);
  const body = JSON.parse(res.text);
  assert.equal(body.status, 'ok');
  assert.equal(body.app, 'bookowska-website');
  assert.deepEqual(body.checks, { db: 'ok' });
});

test('statystyki: odsłona gościa liczona, admina nie', async () => {
  db.prepare('DELETE FROM vk_pageviews').run();
  await client(srv.base).get('/', { headers: BROWSER });
  await client(srv.base, { cookie: sessionCookie() }).get('/warsztaty', { headers: BROWSER });
  await settle();
  assert.deepEqual(pageviews(), [{ path: '/', is_bot: 0 }]);
});

test('panel /admin/statystyki tylko dla admina', async () => {
  assert.equal((await client(srv.base).get('/admin/statystyki')).status, 302);
  const admin = client(srv.base, { cookie: sessionCookie() });
  const res = await admin.get('/admin/statystyki');
  assert.equal(res.status, 200);
  assert.match(res.text, /Unikalne osoby/);
  assert.match(res.headers.get('content-security-policy'), /style-src 'unsafe-inline'/);
  assert.equal((await admin.get('/admin/statystyki.json')).status, 200);
});
