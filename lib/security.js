// Nagłówki bezpieczeństwa, ochrona formularzy przed CSRF i limity żądań.
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const config = require('./config');

// Wszystko serwujemy sami (public/vendor), bez skryptów i stylów inline, więc
// CSP może być ścisłe. Bootstrapowy collapse ustawia wysokość przez CSSOM
// (element.style), czego style-src nie blokuje - 'unsafe-inline' niepotrzebne.
const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      // data: - ikony SVG wbudowane w CSS Bootstrapa (np. strzałka selecta).
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      // Po wybraniu operatora płatności dopisz tu domenę jego bramki - przekierowanie
      // po POST /zamowienie podlega form-action.
      formAction: ["'self'"],
      upgradeInsecureRequests: config.isProduction ? [] : null,
    },
  },
  // Domyślne "no-referrer" sprawia, że przeglądarka wysyła przy POST nagłówek
  // "Origin: null" - wtedy sameOriginPost nie odróżniłby własnego formularza
  // od obcego. strict-origin-when-cross-origin nie zdradza ścieżek obcym stronom.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // HSTS tylko na produkcji (za nginx z TLS); lokalnie serwis działa po http.
  strictTransportSecurity: config.isProduction,
});

// CSRF: żądania zmieniające stan muszą pochodzić z naszej strony. Ciasteczko
// sesji ma SameSite=Lax (główna ochrona); to jest druga warstwa, niezależna od
// sesji - zgłoszenie na warsztaty czy zamówienie nie wymagają logowania.
function sameOriginPost(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const host = req.get('host');
  const source = req.get('origin') && req.get('origin') !== 'null' ? req.get('origin') : req.get('referer');
  let sourceHost = null;
  try {
    sourceHost = source ? new URL(source).host : null;
  } catch {
    sourceHost = null;
  }
  if (sourceHost && sourceHost === host) return next();
  return res.status(403).type('text/plain').send('Żądanie odrzucone: formularz musi zostać wysłany z tej strony.');
}

function limiter({ windowMinutes, limit, message }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => config.isTest,
    handler: (req, res) => res.status(429).type('text/plain').send(message),
  });
}

const limits = {
  signup: limiter({ windowMinutes: 15, limit: 8, message: 'Zbyt wiele zgłoszeń z tego adresu. Spróbuj za kilkanaście minut albo napisz e-mail.' }),
  checkout: limiter({ windowMinutes: 15, limit: 15, message: 'Zbyt wiele prób złożenia zamówienia. Spróbuj za kilkanaście minut.' }),
  cart: limiter({ windowMinutes: 5, limit: 120, message: 'Zbyt wiele operacji na koszyku. Odczekaj chwilę.' }),
  auth: limiter({ windowMinutes: 15, limit: 30, message: 'Zbyt wiele prób logowania. Spróbuj za kilkanaście minut.' }),
};

module.exports = { securityHeaders, sameOriginPost, limits };
