# Bookowska — pracownia introligatorska

Website for **Karina Lewandowska (Bookowska)**, a bookbinder running a small
studio in Sopot, Poland: a business card, a workshop calendar with sign-ups and a
small shop for hand-bound notebooks and gift vouchers.

Built by Karol Konop. Status: in development — staging at
**bookowska.vamude.com**; production will run on the client's own VPS at
**bookowska.shop**. Payments are simulated until the studio picks a payment
operator.

## What it does

- **Business card** — bio, the 2018 artist-book diploma series, custom orders,
  contact. Visual language of a technical drawing: black ink on white paper,
  graph-paper backgrounds, printer's crop marks around photos, figure captions
  ("Rys. 01"), section heads like drawing-sheet labels and a drawing title block
  as the footer. Photos are shown in greyscale — except product photos in the
  shop, which are always in colour.
- **Workshops** — workshop types and dated sessions with live seat counts.
  Signing up is "by e-mail" for now: the form stores the sign-up in SQLite,
  e-mails the studio (with `Reply-To` set to the participant) and sends the
  participant a confirmation. Seats are checked and taken inside one SQLite
  transaction, so two simultaneous sign-ups can't overfill a group. Group
  workshops and talks use a "request a date" variant of the same form.
- **Shop** — catalogue, session cart, checkout with InPost locker / courier /
  pickup, order status page. Each product page renders a **dimensioned technical
  drawing** of the item (front and side view, dimension lines, centre lines,
  hatching for the cloth spine) generated from its dimensions in the database.
- **Admin panel** (`/admin`, Google sign-in) — overview of upcoming sessions
  with occupancy, sign-ups and orders, and **events management**: create, edit,
  close, cancel and delete workshop sessions and workshop types (description,
  programme, price, group size, photo picked from the image library). The rules
  protect people who already signed up: a session with sign-ups can't be
  deleted (only cancelled) or moved to another workshop, and no limit can drop
  below the number of people already registered. Each session page lists its
  sign-ups with a "mail everyone" (BCC) link.

## Architecture notes

- **Express 5 + EJS**, CommonJS, no bundler. Pages render into `views/layout.ejs`
  via a small `res.page()` helper (SEO meta, JSON-LD, header/footer in one place).
- **Strict CSP** (helmet): `script-src 'self'` and `style-src 'self'` with no
  `unsafe-inline` anywhere — no inline scripts, styles or event handlers. All
  front-end assets are self-hosted (`public/vendor`, built by `npm run vendor`):
  Bootstrap 5.3.8, HTML5 Boilerplate 9 base/print styles, IBM Plex Sans/Mono
  (latin + latin-ext for Polish), a 14-icon SVG sprite instead of an icon font.
  No third-party requests, no analytics, no cookies until someone uses the cart.
- **Payments are an adapter** (`lib/payments/`). Today the only provider is
  `mock`, a simulated hosted gateway: checkout redirects to `/platnosc/mock/:ref`,
  the visitor picks an outcome, and that outcome is turned into a payment
  **event** handled by the same `handleEvent()` path a real operator's webhook
  will use. Events are idempotent (`payment_events` unique on provider + event
  id). The mock routes only work while `PAYMENT_PROVIDER=mock` and only for
  orders placed in that mode, and every shop page carries a "test mode" banner.
- **Stock is reserved at order time**, not at payment time — most items are
  one-of-a-kind, so two people must not pay for the same notebook. Unpaid orders
  expire after 30 minutes and release their stock; a payment that arrives after
  expiry still marks the order paid but flags a stock conflict for manual
  follow-up. Prices and totals are always recomputed from the database; the
  session cart only stores product ids and quantities. Order lines are snapshots
  (name, unit price) so catalogue edits never rewrite history.
- **Auth**: Passport + Google OAuth 2.0 with `state` and PKCE. No self sign-up:
  only `ROOT_EMAIL` (the hard-wired owner) and `ADMIN_EMAILS` (or a DB row with
  `role='admin'`) can sign in, the Google e-mail must be verified, and roles are
  recomputed on every request. Unknown Google accounts are rejected without
  storing anything.
- **CSRF**: `SameSite=Lax` session cookie plus an `Origin`/`Referer` check on
  every state-changing request (`Referrer-Policy: strict-origin-when-cross-origin`
  — helmet's default `no-referrer` would make browsers send `Origin: null`).
  Rate limits on sign-ups, checkout, cart and login; a honeypot field instead of
  a CAPTCHA.
- **Content**: workshops and sessions are managed in the admin panel — the
  database is the source of truth and `db/seed/workshops.json` is only imported
  into an empty database. Products still live in `db/seed/products.json` and are
  synced with `npm run seed` (idempotent, never resets sold-out stock).
- **Images**: `npm run images` turns the client's source photos (kept out of the
  repo) into cropped WebP `srcset`s with EXIF/GPS stripped and writes
  `lib/imageManifest.json`; the logo SVGs were extracted from the original `.ai`
  vector file; `npm run icons` builds favicon.ico (hand-assembled ICO container),
  touch/PWA icons and the Open Graph image.
- **SEO**: canonical URLs, Open Graph, JSON-LD (`LocalBusiness`, `Event` for each
  workshop session, `Product`, breadcrumbs), `sitemap.xml`, `llms.txt`.
  Indexing is off (`noindex` + `Disallow: /`) until `ALLOW_INDEXING=true`.

## Setup

```bash
npm install
cp .env.example .env     # set SESSION_SECRET and ROOT_EMAIL at minimum
npm run dev              # http://localhost:3006
```

The app boots without Google, SMTP or company details: login shows a
"not configured" notice, e-mails are logged to the console in development, and
the legal pages show `[uzupełnij: …]` placeholders. On first start an empty
database is filled from `db/seed/*.json`.

| Command | What it does |
|---|---|
| `npm start` / `npm run dev` | Run the server (`dev` restarts on file changes). |
| `npm test` | `node:test` suite on throwaway databases: orders and stock, payment idempotency, seat limits, auth rules, HTTP routes (CSP, CSRF, full purchase flow). |
| `npm run seed [-- --reset-stock]` | Sync products from `db/seed/products.json` (workshops are managed in the panel). |
| `npm run backup` | Consistent SQLite backup to `data/backups/` (keeps the last 30; `BACKUP_DIR`, `BACKUP_KEEP`). |
| `npm run dev-session [-- email]` | Print a cookie for a local admin session (refuses to run in production) — for checking `/admin` before OAuth is set up. |
| `npm run images` | Rebuild photos from `input_data/` (see `scripts/images.config.js`). |
| `npm run icons` | Rebuild favicons, app icons and `og-cover.jpg`. |
| `npm run vendor` | Re-copy Bootstrap, H5BP styles, fonts and the icon sprite into `public/vendor`. |

Google OAuth: the OAuth client needs one authorised redirect URI per
environment — `http://localhost:3006/auth/google/callback`,
`https://bookowska.vamude.com/auth/google/callback` and later
`https://bookowska.shop/auth/google/callback`.

## Deployment (nginx + PM2)

Staging runs on the shared VPS "websites" at `bookowska.vamude.com`; production
will use the same layout on the client's own VPS at `bookowska.shop`.

```bash
cd ~/websites && git clone git@github.com:pogan/bookowska-website.git
cd bookowska-website && npm ci --omit=dev
cp .env.example .env     # NODE_ENV=production, PUBLIC_BASE_URL, secrets…
pm2 start ecosystem.config.js && pm2 save      # port 3006
```

Then add an nginx server block based on `docs/nginx.conf.example` and issue the
certificate with certbot. Updates: `git pull && npm ci --omit=dev && pm2 restart
bookowska-website`. The app listens on 127.0.0.1 in production, sets `trust
proxy` and secure cookies, so it must sit behind TLS with `X-Forwarded-Proto`
forwarded (the shared `snippets/proxy.conf` already does that). Schedule
`npm run backup` from cron once real data lives in the panel.

## Before launch

- bookowska.shop on the client's VPS → `PUBLIC_BASE_URL`, nginx + certificate,
  OAuth redirect URI, backups in cron, then `ALLOW_INDEXING=true`;
- studio e-mail, phone and company details (`CONTACT_*`, `SELLER_*`), SMTP;
- real workshop offer and dates (in the panel) and products (`db/seed/`) — the
  current ones are examples; photo credits for the workshop photos;
- payment operator → `lib/payments/<operator>.js` + webhook route, add its
  domain to `form-action` in the CSP, review the draft terms and privacy policy.

## Project structure

```
app.js                 Express entry point (middleware order, res.page, errors)
db/                    schema.sql, connection, seed/*.json (offer content)
lib/                   config, auth, security, orders, cart, catalog, shipping,
                       workshops, events (admin CRUD), notifications/mailer,
                       payments/, seo, images, drawing (product SVG),
                       format (money, dates, Polish typography)
routes/                pages, workshops, shop, payments (mock gateway), auth,
                       admin + adminEvents
views/                 layout + partials, pages, workshops, shop, legal, admin, errors
public/                css/custom.css, js/main.js, images, vendor/ (generated)
scripts/               seed, backup, images, icons, vendor, dev-session
tests/                 node:test suites
```
