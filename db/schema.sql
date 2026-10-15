-- Schemat bazy SQLite. Wykonywany przy każdym starcie (db/index.js), dlatego
-- wyłącznie CREATE ... IF NOT EXISTS. Nowe kolumny w istniejących tabelach
-- dodaje ensureColumn() w db/index.js.

-- Konta z dostępem do /admin. Root wynika z ROOT_EMAIL w .env (nie z tej
-- tabeli), pozostali administratorzy - z ADMIN_EMAILS albo wiersza z role='admin'.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  google_sub TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'none',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  expires INTEGER NOT NULL,
  sess TEXT NOT NULL
);

-- Katalog sklepu. Ceny w groszach (brutto). stock NULL = bez limitu (np. bon),
-- 0 = wyprzedane. Dane startowe: db/seed/products.json (npm run seed).
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0),
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),
  width_mm INTEGER,
  height_mm INTEGER,
  depth_mm INTEGER,
  sheets INTEGER,
  binding TEXT,
  paper TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rodzaje warsztatów (opis, cena od osoby, wielkość grupy) i ich terminy.
-- Dane startowe: db/seed/workshops.json.
CREATE TABLE IF NOT EXISTS workshops (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  program TEXT NOT NULL DEFAULT '[]',
  duration_minutes INTEGER,
  price INTEGER CHECK (price IS NULL OR price >= 0),
  capacity INTEGER NOT NULL DEFAULT 8,
  level TEXT,
  includes TEXT,
  takeaway TEXT,
  image TEXT,
  kind TEXT NOT NULL DEFAULT 'open',
  is_active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);

-- Terminy warsztatów. starts_at/ends_at w UTC (ISO 8601); wyświetlane w
-- strefie Europe/Warsaw (lib/format.js). capacity/price NULL = jak w warsztacie.
CREATE TABLE IF NOT EXISTS workshop_sessions (
  id INTEGER PRIMARY KEY,
  workshop_id INTEGER NOT NULL REFERENCES workshops(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  location TEXT NOT NULL,
  capacity INTEGER,
  price INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  UNIQUE (workshop_id, starts_at)
);

-- Zgłoszenia na warsztaty (na tym etapie zapis "mailowy": formularz wysyła
-- e-mail do pracowni, a zgłoszenie zostaje tu dla przyszłego panelu uczestników).
-- kind: 'session' (konkretny termin) albo 'request' (zapytanie o termin / grupę).
CREATE TABLE IF NOT EXISTS workshop_signups (
  id INTEGER PRIMARY KEY,
  workshop_id INTEGER REFERENCES workshops(id),
  session_id INTEGER REFERENCES workshop_sessions(id),
  kind TEXT NOT NULL DEFAULT 'session',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  participants INTEGER NOT NULL DEFAULT 1,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  studio_notified_at TEXT,
  confirmation_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_signups_session ON workshop_signups(session_id);

-- Zamówienia ze sklepu. number - dla ludzi (BK-2026-0001), token - losowy
-- identyfikator w adresie strony statusu. Kwoty w groszach brutto.
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  shipping_method TEXT NOT NULL,
  shipping_cost INTEGER NOT NULL,
  shipping_address TEXT,
  parcel_locker TEXT,
  notes TEXT,
  subtotal INTEGER NOT NULL,
  total INTEGER NOT NULL,
  payment_provider TEXT NOT NULL,
  payment_ref TEXT UNIQUE,
  terms_accepted_at TEXT NOT NULL,
  -- 1 = płatność przyszła po wygaśnięciu rezerwacji, a towaru już nie było
  -- (do ręcznego wyjaśnienia z klientem - widoczne w panelu).
  stock_conflict INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  closed_at TEXT,
  customer_email_sent_at TEXT,
  studio_email_sent_at TEXT
);

-- Pozycje zamówienia jako migawka (nazwa, cena z chwili zakupu) - zmiana albo
-- usunięcie produktu z katalogu nie zmienia historii zamówień.
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Powiadomienia od operatora płatności (dziś: symulacja, lib/payments/mock.js).
-- Operatorzy dostarczają je "co najmniej raz", więc UNIQUE(provider, event_id)
-- czyni obsługę idempotentną.
CREATE TABLE IF NOT EXISTS payment_events (
  id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  status TEXT NOT NULL,
  payload TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (provider, event_id)
);
