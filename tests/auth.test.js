require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const { verify, roleOf } = require('../lib/auth');

const profile = (email, verified = true, id = String(Math.random())) => ({
  id,
  displayName: 'Test',
  emails: [{ value: email, verified }],
});

const run = (p) =>
  new Promise((resolve) => verify('access', 'refresh', p, (err, user, info) => resolve({ err, user, info })));

const userCount = () => db.prepare('SELECT COUNT(*) AS n FROM users').get().n;

test('root z ROOT_EMAIL loguje się (wielkość liter bez znaczenia)', async () => {
  const { user } = await run(profile('Root@Example.com'));
  assert.equal(user.email, 'root@example.com');
  assert.equal(roleOf(user), 'root');
});

test('admin z ADMIN_EMAILS loguje się jako admin', async () => {
  const { user } = await run(profile('admin@example.com'));
  assert.equal(roleOf(user), 'admin');
});

test('niepotwierdzony e-mail jest odrzucany nawet dla roota', async () => {
  const { user, info } = await run(profile('root@example.com', false));
  assert.equal(user, false);
  assert.equal(info.message, 'unverified');
});

test('obce konto Google: odmowa i brak zapisu w bazie', async () => {
  const before = userCount();
  const { user, info } = await run(profile('ktos@gmail.com'));
  assert.equal(user, false);
  assert.equal(info.message, 'forbidden');
  assert.equal(userCount(), before);
});

test('dezaktywowane konto traci dostęp', async () => {
  db.prepare("UPDATE users SET is_active = 0 WHERE email = 'admin@example.com'").run();
  const { user } = await run(profile('admin@example.com'));
  assert.equal(user, false);
  assert.equal(roleOf(db.prepare("SELECT * FROM users WHERE email = 'admin@example.com'").get()), null);
});
