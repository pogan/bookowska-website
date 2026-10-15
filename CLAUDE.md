# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Website for Karina Lewandowska's bookbinding studio **Bookowska** (Sopot): business
card, workshop calendar with e-mail sign-ups, small shop with a **simulated**
payment gateway, read-only admin panel behind Google sign-in. Polish UI, code
comments in Polish, README in English. No domain yet; target is the VPS
"websites" (nginx reverse proxy + PM2, port **3006**, Node 20 on the server).

## Commands

- `npm run dev` — server with `--watch` on `PORT` from `.env` (3006).
- `npm test` — `node --test` (auto-discovers `tests/*.test.js`; keep it argument-free:
  Node 20 on the server has no glob support and `node --test tests/` fails on 24).
  `tests/helpers.js` must be required first — it sets `NODE_ENV=test` and a temp
  `DB_PATH`; `lib/config.js` skips `.env` in tests.
- `npm run seed` — sync `db/seed/*.json` → SQLite. Offer content (workshops,
  sessions, products) is edited there, not in a panel. Stock is only written on
  first import (`-- --reset-stock` to force).
- `npm run images` / `npm run icons` / `npm run vendor` — regenerate committed
  assets. `images` needs `input_data/` (client originals, gitignored).
- `npm run dev-session` — prints a `bookowska.sid=…` cookie for a local root
  session; use with `curl -H "Cookie: …"` to check `/admin` without Google.

## Architecture rules

- **No inline scripts/styles, no `style=""`, no `on*=` attributes.** CSP is
  `script-src 'self'; style-src 'self'`. Behaviour goes in `public/js/main.js`
  (progressive enhancement — every form must work without JS). Inline SVG must use
  presentation attributes/classes, not `style`.
- Pages render through `res.page(view, locals)` (app.js) into `views/layout.ejs`.
  Pass `title`, `description`, `canonicalPath`, `ogImageKey`, `jsonLd`, `noindex`,
  `showTestBanner` as needed. EJS includes see parent locals — guard optional
  partial params with `typeof x !== 'undefined'`.
- Money is integer grosze everywhere; dates are stored as UTC ISO and shown in
  Europe/Warsaw via `lib/format.js`. Use `f.typo()` on Polish prose (binds
  one-letter words with NBSP).
- Shop correctness: prices come from the DB at order time; stock is reserved on
  order creation and released on failure/expiry (`lib/orders.js`); payment state
  changes only through `payments.handleEvent()` (idempotent `payment_events`).
  A real operator = new `lib/payments/<id>.js` + signed webhook route calling
  `handleEvent()`, and its domain added to `form-action` in `lib/security.js`.
- `sameOriginPost` (lib/security.js) rejects POSTs without a matching
  `Origin`/`Referer`. Keep `Referrer-Policy: strict-origin-when-cross-origin` —
  with helmet's default `no-referrer` browsers send `Origin: null` and every form
  breaks. Future webhooks from payment operators must be mounted **before** it.
- Auth: only `ROOT_EMAIL` / `ADMIN_EMAILS` / `users.role='admin'` can sign in;
  roles are recomputed per request (`lib/auth.js`).

## Styling

`public/css/custom.css` on top of precompiled Bootstrap 5.3.8 — themed through
CSS variables (`--bs-*`), zero border radius, IBM Plex Sans/Mono. Visual
vocabulary: `.sheet` + `partials/sheet-head` (numbered section heads),
`partials/photo` (crop marks, "Rys. NN" captions, greyscale unless
`color`/`hoverColor`), `.spec` / `.spec-table` (parameter tables), `.title-block`
(footer), `.grid-paper`, `.test-banner`. Keep it almost black-and-white.

## Gotchas found the hard way

- Bootstrap `.g-5` rows overflow phone screens (−1.5rem row margin vs container
  padding); custom.css narrows it below 576px — don't remove.
- The Chrome extension window can't go below ~1440px wide on macOS; test mobile
  with headless Chrome over CDP (`Emulation.setDeviceMetricsOverride`, Node 24
  has a global `WebSocket`) and check `document.documentElement.scrollWidth`.
- `better-sqlite3` 13+ requires Node 22 — the server runs Node 20, stay on 12.x
  until the VPS is upgraded.
- dotenv ≥17 logs on every load — `config({ quiet: true })`.

## Version control

Commit as you work, directly on `main`, with short imperative messages. Don't
push unless asked. Never commit `.env`, `data/` or `input_data/`.
