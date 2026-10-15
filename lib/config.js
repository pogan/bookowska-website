// Jedyne miejsce, które czyta zmienne środowiskowe (.env, patrz .env.example).
// Reszta kodu importuje gotowe, znormalizowane wartości. Brak opcjonalnych usług
// (Google OAuth, SMTP) nie blokuje startu - odpowiednie funkcje degradują się
// łagodnie i logują ostrzeżenie. Na produkcji brak SESSION_SECRET / ROOT_EMAIL
// przerywa start, bo bez nich serwis byłby niebezpieczny albo bez administratora.
require('dotenv').config({ quiet: true });

const env = process.env;

const list = (value) =>
  (value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const isProduction = env.NODE_ENV === 'production';
const port = parseInt(env.PORT || '3006', 10);
const baseUrl = (env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

const config = {
  isProduction,
  isTest: env.NODE_ENV === 'test',
  port,
  baseUrl,
  // Indeksowanie przez wyszukiwarki dopiero po podpięciu docelowej domeny -
  // podgląd na tymczasowym adresie nie powinien trafić do Google.
  allowIndexing: env.ALLOW_INDEXING === 'true',

  sessionSecret: env.SESSION_SECRET || '',

  auth: {
    rootEmail: (env.ROOT_EMAIL || '').trim().toLowerCase(),
    adminEmails: list(env.ADMIN_EMAILS),
    google: {
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl: env.GOOGLE_CALLBACK_URL || `${baseUrl}/auth/google/callback`,
    },
  },

  mail: {
    host: env.SMTP_HOST || '',
    port: parseInt(env.SMTP_PORT || '587', 10),
    secure: env.SMTP_SECURE === 'true' || env.SMTP_PORT === '465',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || env.SMTP_USER || '',
  },

  // Dane kontaktowe pracowni (strona, stopka, adresat zgłoszeń i zamówień).
  contact: {
    email: (env.CONTACT_EMAIL || '').trim(),
    phone: (env.CONTACT_PHONE || '').trim(),
    studioAddress: (env.STUDIO_ADDRESS || '').trim(),
  },

  // Dane sprzedawcy do regulaminu, polityki prywatności i potwierdzeń zamówień.
  seller: {
    name: (env.SELLER_NAME || '').trim(),
    address: (env.SELLER_ADDRESS || '').trim(),
    nip: (env.SELLER_NIP || '').trim(),
    regon: (env.SELLER_REGON || '').trim(),
  },

  payments: {
    provider: (env.PAYMENT_PROVIDER || 'mock').trim(),
  },

  dbPath: env.DB_PATH || '',
};

function validate() {
  const errors = [];
  const warnings = [];
  if (isProduction) {
    if (config.sessionSecret.length < 32) errors.push('SESSION_SECRET musi mieć co najmniej 32 znaki.');
    if (!config.auth.rootEmail) errors.push('Brak ROOT_EMAIL - nikt nie miałby dostępu do panelu.');
    if (!env.PUBLIC_BASE_URL) warnings.push('Brak PUBLIC_BASE_URL - linki w e-mailach i canonical wskażą localhost.');
    if (!config.mail.host) warnings.push('Brak SMTP_HOST - zgłoszenia i zamówienia NIE będą wysyłane e-mailem (tylko zapis w bazie).');
    if (!config.contact.email) warnings.push('Brak CONTACT_EMAIL - pracownia nie dostanie powiadomień o zgłoszeniach.');
    const missingSeller = Object.entries(config.seller).filter(([k, v]) => k !== 'regon' && !v).map(([k]) => `SELLER_${k.toUpperCase()}`);
    if (missingSeller.length) warnings.push(`Niepełne dane sprzedawcy (${missingSeller.join(', ')}) - regulamin pokaże puste pola.`);
    if (config.payments.provider === 'mock') warnings.push('PAYMENT_PROVIDER=mock - płatności są symulowane, sklep działa w trybie testowym.');
  }
  return { errors, warnings };
}

module.exports = { ...config, validate };
