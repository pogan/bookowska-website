const config = require('./lib/config');
const path = require('path');
const express = require('express');
const compression = require('compression');
const session = require('express-session');

const db = require('./db');
const SqliteSessionStore = require('./lib/sqliteSessionStore');
const { passport, roleOf } = require('./lib/auth');
const { securityHeaders, sameOriginPost } = require('./lib/security');
const { APP_VERSION } = require('./lib/version');
const { seedIfEmpty } = require('./lib/seed');
const site = require('./lib/site');
const seo = require('./lib/seo');
const cart = require('./lib/cart');
const images = require('./lib/images');
const format = require('./lib/format');
const payments = require('./lib/payments');

const { errors, warnings } = config.validate();
for (const w of warnings) console.warn(`[konfiguracja] ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[konfiguracja] ${e}`);
  throw new Error('Nieprawidłowa konfiguracja produkcyjna - popraw .env (patrz .env.example).');
}

// Pierwsze uruchomienie na pustej bazie: wczytaj przykładową ofertę z db/seed.
const seeded = seedIfEmpty();
if (seeded && !config.isTest) console.log('[seed] Pusta baza - wczytano ofertę z db/seed/*.json.');

const app = express();

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(securityHeaders);
app.use(compression());
// Podgląd przed podpięciem domeny nie powinien trafić do wyszukiwarek.
app.use((req, res, next) => {
  if (!config.allowIndexing) res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});
// Statyczne pliki przed sesją - zdjęcia i CSS nie dotykają bazy sesji.
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: config.isProduction ? '7d' : 0,
    setHeaders(res, filePath) {
      if (config.isProduction && filePath.includes(`${path.sep}vendor${path.sep}fonts${path.sep}`)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '20kb' }));

app.use(
  session({
    name: 'bookowska.sid',
    store: new SqliteSessionStore(db),
    secret: config.sessionSecret || 'dev-secret-tylko-lokalnie',
    resave: false,
    // Sesja (i ciasteczko) powstaje dopiero, gdy jest potrzebna: koszyk, logowanie.
    saveUninitialized: false,
    cookie: {
      maxAge: 14 * 24 * 60 * 60 * 1000,
      secure: config.isProduction,
      httpOnly: true,
      sameSite: 'lax',
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());
app.use(sameOriginPost);

// Adresy CSS/JS z wersją (commit) - po wdrożeniu przeglądarki pobierają nowe pliki.
const assetVersion = APP_VERSION.commit || APP_VERSION.version;
const asset = (p) => `${p}?v=${assetVersion}`;

app.use((req, res, next) => {
  const role = roleOf(req.user);
  Object.assign(res.locals, {
    site,
    contact: config.contact,
    seller: config.seller,
    baseUrl: config.baseUrl,
    user: req.user || null,
    role,
    isAdmin: Boolean(role),
    cartCount: cart.count(req.session),
    currentPath: req.path,
    f: format,
    img: images.img,
    imgMeta: images.meta,
    asset,
    appVersion: APP_VERSION,
    testMode: payments.isTestMode(),
    flash: null,
  });
  if (req.session && req.session.flash) {
    res.locals.flash = req.session.flash;
    delete req.session.flash;
  }
  next();
});

// res.page(widok, dane): renderuje widok strony, a potem osadza go w layout.ejs
// (nagłówek, stopka, meta SEO wspólne dla wszystkich stron).
app.use((req, res, next) => {
  res.page = (view, locals = {}) => {
    const ogImage = locals.ogImageKey ? images.ogUrl(locals.ogImageKey, config.baseUrl) : null;
    const meta = {
      title: site.legalBrand,
      description: site.description,
      canonicalUrl: locals.canonicalPath ? seo.abs(locals.canonicalPath) : null,
      ogImage: ogImage || seo.abs(seo.DEFAULT_OG),
      ogType: 'website',
      noindex: !config.allowIndexing,
      jsonLd: [],
      bodyClass: '',
      showTestBanner: false,
      ...locals,
    };
    meta.noindex = meta.noindex || !config.allowIndexing;
    res.render(view, meta, (err, body) => {
      if (err) return next(err);
      res.render('layout', { ...meta, body, jsonLdHtml: meta.jsonLd.map(seo.jsonLd) });
    });
  };
  next();
});

app.use('/', require('./routes/pages').router);
app.use('/', require('./routes/workshops').router);
app.use('/', require('./routes/shop').router);
app.use('/', require('./routes/payments').router);
app.use('/', require('./routes/auth').router);
app.use('/admin', require('./routes/admin').router);

app.use((req, res) => {
  res.status(404).page('errors/404', { title: `Nie znaleziono strony | ${site.name}`, noindex: true });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500);
  // Drugi przebieg (wysypał się sam szablon strony błędu) albo błąd sprzed
  // rejestracji res.page - zwykły tekst, bez ryzyka pętli.
  if (req.errorPageAttempted || typeof res.page !== 'function') {
    return res.type('text/plain').send('Wystąpił błąd serwera.');
  }
  req.errorPageAttempted = true;
  res.page('errors/500', { title: `Błąd serwera | ${site.name}`, noindex: true });
});

if (require.main === module) {
  app.listen(config.port, config.host, () => {
    console.log(`bookowska-website ${APP_VERSION.label} nasłuchuje na http://${config.host || 'localhost'}:${config.port}`);
  });
}

module.exports = app;
