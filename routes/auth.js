const express = require('express');
const site = require('../lib/site');
const config = require('../lib/config');
const { passport, googleConfigured, previewUser } = require('../lib/auth');
const { limits } = require('../lib/security');

const router = express.Router();

router.get('/auth/google', limits.auth, (req, res, next) => {
  // Podgląd dla klientki: logowanie zawsze się udaje, bez Google (lib/config.js).
  if (config.previewLogin) {
    return req.logIn(previewUser(), { keepSessionInfo: true }, (err) => (err ? next(err) : res.redirect('/kierownik')));
  }
  if (!googleConfigured) {
    return res.status(503).page('admin/login', {
      title: `Logowanie | ${site.name}`,
      noindex: true,
      googleConfigured: false,
      notice: 'Logowanie Google nie jest skonfigurowane — uzupełnij GOOGLE_CLIENT_ID i GOOGLE_CLIENT_SECRET w .env.',
    });
  }
  return passport.authenticate('google', { scope: ['openid', 'email', 'profile'], prompt: 'select_account' })(req, res, next);
});

router.get('/auth/google/callback', limits.auth, (req, res, next) => {
  if (!googleConfigured || config.previewLogin) return res.redirect('/kierownik');
  return passport.authenticate('google', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      const reason = info && info.message === 'unverified' ? 'niepotwierdzony' : 'odmowa';
      return res.redirect(`/kierownik?logowanie=${reason}`);
    }
    // keepSessionInfo: passport i tak zmienia identyfikator sesji (ochrona przed
    // session fixation), ale zachowuje jej zawartość - np. koszyk.
    return req.logIn(user, { keepSessionInfo: true }, (loginErr) => {
      if (loginErr) return next(loginErr);
      return res.redirect('/kierownik');
    });
  })(req, res, next);
});

router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect(303, '/');
  });
});

module.exports = { router };
