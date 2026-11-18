const { startServer, client } = require('./helpers');
// Tryb podglądu: musi być ustawiony przed załadowaniem lib/config (startServer ładuje app).
process.env.PREVIEW_LOGIN = 'true';
process.env.PUBLIC_BASE_URL = 'https://bookowska.staging.vamude.com';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');

let srv;
test.before(async () => {
  srv = await startServer();
});
test.after(() => srv.close());

test('podgląd: strona logowania pokazuje wejście bez Google', async () => {
  const res = await client(srv.base).get('/kierownik');
  assert.equal(res.status, 200);
  assert.match(res.text, /Wejdź do panelu \(wersja testowa\)/);
  assert.doesNotMatch(res.text, /Zaloguj przez Google/);
});

test('podgląd: logowanie zawsze się udaje i otwiera panel', async () => {
  const c = client(srv.base);
  const login = await c.get('/auth/google');
  assert.equal(login.status, 302);
  assert.equal(login.location, '/kierownik');
  const panel = await c.get('/kierownik');
  assert.equal(panel.status, 200);
  assert.doesNotMatch(panel.text, /Wejdź do panelu/);
  // Drugie logowanie (konto już istnieje) też się udaje.
  const again = await client(srv.base).get('/auth/google');
  assert.equal(again.location, '/kierownik');
});

// validate() w osobnym procesie, bo config czyta środowisko raz, przy pierwszym require.
function validateWith(env) {
  const r = spawnSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify(require('./lib/config').validate()))"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
  return JSON.parse(r.stdout);
}

test('PREVIEW_LOGIN poza podglądem blokuje start (np. bookowska.shop)', () => {
  const prod = validateWith({ NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://bookowska.shop' });
  assert.ok(prod.errors.some((e) => e.includes('PREVIEW_LOGIN')));
  const other = validateWith({ PUBLIC_BASE_URL: 'https://staging.vamude.com.evil.example' });
  assert.ok(other.errors.some((e) => e.includes('PREVIEW_LOGIN')));
});

test('PREVIEW_LOGIN na podglądzie: bez błędu, z ostrzeżeniem', () => {
  const ok = validateWith({ PUBLIC_BASE_URL: 'https://bookowska.staging.vamude.com' });
  assert.equal(ok.errors.length, 0);
  assert.ok(ok.warnings.some((w) => w.includes('PREVIEW_LOGIN')));
});

test('bez PREVIEW_LOGIN produkcja nie zmienia zachowania', () => {
  const prod = validateWith({ PREVIEW_LOGIN: '', NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://bookowska.shop' });
  assert.ok(!prod.errors.some((e) => e.includes('PREVIEW_LOGIN')));
});
