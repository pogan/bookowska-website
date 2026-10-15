// Synchronizacja oferty (db/seed/*.json) z bazą. Na tym etapie oferta jest
// utrzymywana w repo, a nie w panelu - dlatego import jest idempotentny
// (upsert po slugu) i bezpieczny dla danych sprzedażowych:
// - stan magazynowy ustawiamy tylko przy pierwszym imporcie produktu (ponowny
//   seed nie może "odsprzedać" egzemplarza, który już się sprzedał);
// - produkty usunięte z pliku są ukrywane (is_active=0), nie kasowane - pozycje
//   zamówień wskazują na nie kluczem obcym;
// - terminy usunięte z pliku kasujemy tylko, jeśli nikt się na nie nie zapisał.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { warsawToUtc } = require('./format');

const SEED_DIR = path.join(__dirname, '..', 'db', 'seed');
const DEFAULT_LOCATION = 'Pracownia Bookowska, Sopot';

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, `${name}.json`), 'utf8'));
}

function syncProducts({ resetStock = false } = {}) {
  const { products } = readSeed('products');
  const findBySlug = db.prepare('SELECT id FROM products WHERE slug = ?');
  const insert = db.prepare(`
    INSERT INTO products (slug, name, summary, description, price, stock, width_mm, height_mm, depth_mm,
                          sheets, binding, paper, images, is_active, sort)
    VALUES (@slug, @name, @summary, @description, @price, @stock, @width_mm, @height_mm, @depth_mm,
            @sheets, @binding, @paper, @images, 1, @sort)
  `);
  const update = db.prepare(`
    UPDATE products SET name = @name, summary = @summary, description = @description, price = @price,
      width_mm = @width_mm, height_mm = @height_mm, depth_mm = @depth_mm, sheets = @sheets,
      binding = @binding, paper = @paper, images = @images, is_active = 1, sort = @sort,
      updated_at = datetime('now')
      ${resetStock ? ', stock = @stock' : ''}
    WHERE slug = @slug
  `);
  const stats = { inserted: 0, updated: 0, hidden: 0 };

  for (const p of products) {
    const row = {
      slug: p.slug,
      name: p.name,
      summary: p.summary || '',
      description: p.description || '',
      price: p.price,
      stock: p.stock ?? null,
      width_mm: p.width_mm ?? null,
      height_mm: p.height_mm ?? null,
      depth_mm: p.depth_mm ?? null,
      sheets: p.sheets ?? null,
      binding: p.binding ?? null,
      paper: p.paper ?? null,
      images: JSON.stringify(p.images || []),
      sort: p.sort ?? 0,
    };
    if (findBySlug.get(p.slug)) {
      update.run(row);
      stats.updated++;
    } else {
      insert.run(row);
      stats.inserted++;
    }
  }

  const slugs = products.map((p) => p.slug);
  const hidden = db
    .prepare(`UPDATE products SET is_active = 0 WHERE is_active = 1 AND slug NOT IN (${slugs.map(() => '?').join(',') || "''"})`)
    .run(...slugs);
  stats.hidden = hidden.changes;
  return stats;
}

function syncWorkshops() {
  const { workshops } = readSeed('workshops');
  const findBySlug = db.prepare('SELECT id FROM workshops WHERE slug = ?');
  const insert = db.prepare(`
    INSERT INTO workshops (slug, title, summary, description, program, duration_minutes, price, capacity,
                           level, includes, takeaway, image, kind, is_active, sort)
    VALUES (@slug, @title, @summary, @description, @program, @duration_minutes, @price, @capacity,
            @level, @includes, @takeaway, @image, @kind, 1, @sort)
  `);
  const update = db.prepare(`
    UPDATE workshops SET title = @title, summary = @summary, description = @description, program = @program,
      duration_minutes = @duration_minutes, price = @price, capacity = @capacity, level = @level,
      includes = @includes, takeaway = @takeaway, image = @image, kind = @kind, is_active = 1, sort = @sort
    WHERE slug = @slug
  `);
  const upsertSession = db.prepare(`
    INSERT INTO workshop_sessions (workshop_id, starts_at, ends_at, location, capacity, price, status, note)
    VALUES (@workshop_id, @starts_at, @ends_at, @location, @capacity, @price, @status, @note)
    ON CONFLICT (workshop_id, starts_at) DO UPDATE SET
      ends_at = excluded.ends_at, location = excluded.location, capacity = excluded.capacity,
      price = excluded.price, status = excluded.status, note = excluded.note
  `);
  const sessionsOf = db.prepare(`
    SELECT s.id, s.starts_at, (SELECT COUNT(*) FROM workshop_signups g WHERE g.session_id = s.id) AS signups
    FROM workshop_sessions s WHERE s.workshop_id = ?
  `);
  const deleteSession = db.prepare('DELETE FROM workshop_sessions WHERE id = ?');
  const stats = { workshops: 0, sessions: 0, removedSessions: 0, keptWithSignups: 0, hidden: 0 };

  for (const w of workshops) {
    const row = {
      slug: w.slug,
      title: w.title,
      summary: w.summary || '',
      description: w.description || '',
      program: JSON.stringify(w.program || []),
      duration_minutes: w.duration_minutes ?? null,
      price: w.price ?? null,
      capacity: w.capacity ?? 8,
      level: w.level ?? null,
      includes: w.includes ?? null,
      takeaway: w.takeaway ?? null,
      image: w.image ?? null,
      kind: w.kind === 'request' ? 'request' : 'open',
      sort: w.sort ?? 0,
    };
    const existing = findBySlug.get(w.slug);
    if (existing) update.run(row);
    else insert.run(row);
    const workshopId = existing ? existing.id : findBySlug.get(w.slug).id;
    stats.workshops++;

    const wanted = new Set();
    for (const s of w.sessions || []) {
      const startsAt = warsawToUtc(s.start);
      wanted.add(startsAt);
      upsertSession.run({
        workshop_id: workshopId,
        starts_at: startsAt,
        ends_at: warsawToUtc(s.end),
        location: s.location || DEFAULT_LOCATION,
        capacity: s.capacity ?? null,
        price: s.price ?? null,
        status: s.status === 'cancelled' ? 'cancelled' : 'open',
        note: s.note ?? null,
      });
      stats.sessions++;
    }
    for (const s of sessionsOf.all(workshopId)) {
      if (wanted.has(s.starts_at)) continue;
      if (s.signups > 0) {
        stats.keptWithSignups++;
        continue;
      }
      deleteSession.run(s.id);
      stats.removedSessions++;
    }
  }

  const slugs = workshops.map((w) => w.slug);
  stats.hidden = db
    .prepare(`UPDATE workshops SET is_active = 0 WHERE is_active = 1 AND slug NOT IN (${slugs.map(() => '?').join(',') || "''"})`)
    .run(...slugs).changes;
  return stats;
}

function syncAll(options = {}) {
  return db.transaction(() => ({
    products: syncProducts(options),
    workshops: syncWorkshops(),
  }))();
}

// Pierwsze uruchomienie (pusta baza) - wczytaj ofertę, żeby strona od razu
// miała treść. Później synchronizacja wyłącznie na żądanie (npm run seed).
function seedIfEmpty() {
  const { n } = db.prepare('SELECT (SELECT COUNT(*) FROM products) + (SELECT COUNT(*) FROM workshops) AS n').get();
  if (n > 0) return null;
  return syncAll();
}

module.exports = { syncAll, seedIfEmpty };
