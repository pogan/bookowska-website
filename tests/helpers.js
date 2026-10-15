// Wspólne przygotowanie testów: każdy plik testowy (osobny proces node --test)
// dostaje własną, tymczasową bazę i kompletne, kontrolowane środowisko.
// Musi być zaimportowany PRZED czymkolwiek z lib/ albo db/.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bookowska-test-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_PATH: path.join(dir, 'test.sqlite'),
  SESSION_SECRET: 'test-secret-test-secret-test-secret',
  ROOT_EMAIL: 'root@example.com',
  ADMIN_EMAILS: 'admin@example.com',
  PAYMENT_PROVIDER: 'mock',
  PUBLIC_BASE_URL: 'http://bookowska.test',
  ALLOW_INDEXING: 'false',
  SMTP_HOST: '',
  CONTACT_EMAIL: 'pracownia@example.com',
  GOOGLE_CLIENT_ID: '',
  GOOGLE_CLIENT_SECRET: '',
});

process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));

// Serwer HTTP na losowym porcie + klient z obsługą ciasteczka sesji i nagłówka
// Origin (wymaganego przez ochronę CSRF dla POST).
async function startServer() {
  const app = require('../app');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, close: () => new Promise((r) => server.close(r)) };
}

function client(base) {
  let cookie = '';
  async function request(method, pathname, { form, headers = {}, origin = base } = {}) {
    const h = { ...headers };
    if (origin) h.origin = origin;
    if (cookie) h.cookie = cookie;
    let body;
    if (form) {
      h['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const res = await fetch(base + pathname, { method, headers: h, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const pair = c.split(';')[0];
      if (pair.startsWith('bookowska.sid=')) cookie = pair;
    }
    return { status: res.status, location: res.headers.get('location'), headers: res.headers, text: await res.text() };
  }
  return {
    get: (p, o) => request('GET', p, o),
    post: (p, form, o = {}) => request('POST', p, { ...o, form }),
    hasSession: () => Boolean(cookie),
  };
}

module.exports = { startServer, client };
