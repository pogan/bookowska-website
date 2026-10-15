// Lokalna sesja administratora bez logowania Google - do sprawdzania panelu
// curl-em albo w headless Chrome, zanim powstanie klient OAuth.
// Użycie: npm run dev-session  [-- email]   (domyślnie ROOT_EMAIL)
// Wypisuje nagłówek Cookie. Odmawia działania przy NODE_ENV=production.
const config = require('../lib/config');
const crypto = require('crypto');
const db = require('../db');

if (config.isProduction) {
  console.error('dev-session nie działa na produkcji.');
  process.exit(1);
}

const email = (process.argv[2] || config.auth.rootEmail || '').toLowerCase();
if (!email) {
  console.error('Podaj e-mail albo ustaw ROOT_EMAIL w .env.');
  process.exit(1);
}

let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
if (!user) {
  db.prepare("INSERT INTO users (email, name) VALUES (?, 'dev-session')").run(email);
  user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

const maxAge = 24 * 60 * 60 * 1000;
const sid = crypto.randomBytes(24).toString('base64url');
const sess = {
  cookie: { originalMaxAge: maxAge, expires: new Date(Date.now() + maxAge).toISOString(), httpOnly: true, path: '/', sameSite: 'lax', secure: false },
  passport: { user: user.id },
};
db.prepare('INSERT INTO sessions (sid, expires, sess) VALUES (?, ?, ?)').run(sid, Date.now() + maxAge, JSON.stringify(sess));

// Podpis jak w express-session (cookie-signature): HMAC-SHA256, base64 bez "=".
const secret = config.sessionSecret || 'dev-secret-tylko-lokalnie';
const signature = crypto.createHmac('sha256', secret).update(sid).digest('base64').replace(/=+$/, '');
console.log(`bookowska.sid=${encodeURIComponent(`s:${sid}.${signature}`)}`);
