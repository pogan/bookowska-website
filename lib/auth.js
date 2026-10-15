// Logowanie do panelu przez Google (Passport, OAuth 2.0 z state + PKCE).
//
// Model uprawnień:
// - root: adres z ROOT_EMAIL w .env - "zaszyty" właściciel serwisu;
// - admin: adres z ADMIN_EMAILS albo konto z role='admin' w tabeli users;
// - nikt inny nie może się zalogować i nie zakładamy mu konta (nie
//   przechowujemy danych przypadkowych osób, które kliknęły "Zaloguj").
// Rola jest liczona przy KAŻDYM żądaniu z aktualnego .env i bazy, więc usunięcie
// adresu z ADMIN_EMAILS odbiera dostęp od razu, bez wylogowywania.
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const config = require('./config');
const db = require('../db');

const stmts = {
  byId: db.prepare('SELECT * FROM users WHERE id = ?'),
  byEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  insert: db.prepare(
    "INSERT INTO users (email, name, google_sub, last_login_at) VALUES (@email, @name, @sub, datetime('now'))",
  ),
  update: db.prepare(
    "UPDATE users SET name = @name, google_sub = @sub, last_login_at = datetime('now') WHERE id = @id",
  ),
};

function roleForEmail(email, dbRole) {
  const e = String(email || '').toLowerCase();
  if (!e) return null;
  if (config.auth.rootEmail && e === config.auth.rootEmail) return 'root';
  if (config.auth.adminEmails.includes(e) || dbRole === 'admin') return 'admin';
  return null;
}

function roleOf(user) {
  if (!user || !user.is_active) return null;
  return roleForEmail(user.email, user.role);
}

function isAdmin(req) {
  return Boolean(roleOf(req.user));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => done(null, stmts.byId.get(id) || false));

const googleConfigured = Boolean(config.auth.google.clientId && config.auth.google.clientSecret);

function verify(accessToken, refreshToken, profile, done) {
  const primary = (profile.emails || [])[0] || {};
  const email = String(primary.value || '').toLowerCase();
  // Adres musi być potwierdzony przez Google - inaczej ktoś mógłby podpiąć cudzy
  // e-mail do własnego konta Google i podszyć się pod administratora.
  if (!email || primary.verified !== true) {
    return done(null, false, { message: 'unverified' });
  }
  const existing = stmts.byEmail.get(email);
  if (!roleForEmail(email, existing && existing.role) || (existing && !existing.is_active)) {
    return done(null, false, { message: 'forbidden' });
  }
  const data = { email, name: profile.displayName || null, sub: profile.id };
  if (existing) stmts.update.run({ ...data, id: existing.id });
  else stmts.insert.run(data);
  return done(null, stmts.byEmail.get(email));
}

if (googleConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.auth.google.clientId,
        clientSecret: config.auth.google.clientSecret,
        callbackURL: config.auth.google.callbackUrl,
        state: true,
        pkce: true,
      },
      verify,
    ),
  );
}

module.exports = { passport, googleConfigured, roleOf, isAdmin, verify };
