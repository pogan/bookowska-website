// Dane startowe z db/seed/*.json.
//
// Warsztaty i terminy: zarządzane w panelu (/admin/wydarzenia), więc baza jest
// źródłem prawdy. db/seed/workshops.json trafia do bazy WYŁĄCZNIE wtedy, gdy
// tabela warsztatów jest pusta (pierwsze uruchomienie) - nic nie nadpisuje zmian
// z panelu.
//
// Produkty: na razie utrzymywane w repo. `npm run seed` synchronizuje je
// idempotentnie (upsert po slugu) i bezpiecznie dla sprzedaży:
// - stan magazynowy ustawiamy tylko przy pierwszym imporcie produktu (ponowny
//   seed nie może "odsprzedać" egzemplarza, który już się sprzedał);
// - produkty usunięte z pliku są ukrywane (is_active=0), nie kasowane - pozycje
//   zamówień wskazują na nie kluczem obcym.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { warsawToUtc } = require('./format');

const SEED_DIR = path.join(__dirname, '..', 'db', 'seed');
const DEFAULT_LOCATION = 'Pracownia Bookowska, Sopot';

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(SEED_DIR, `${name}.json`), 'utf8'));
}

const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

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

  return db.transaction(() => {
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
    stats.hidden = db
      .prepare(`UPDATE products SET is_active = 0 WHERE is_active = 1 AND slug NOT IN (${slugs.map(() => '?').join(',') || "''"})`)
      .run(...slugs).changes;
    return stats;
  })();
}

// Tylko do pustej bazy - patrz komentarz na górze pliku.
function importWorkshops() {
  if (count('workshops') > 0) return null;
  const { workshops } = readSeed('workshops');
  const insertWorkshop = db.prepare(`
    INSERT INTO workshops (slug, title, summary, description, program, duration_minutes, price, capacity,
                           level, includes, takeaway, image, kind, is_active, sort)
    VALUES (@slug, @title, @summary, @description, @program, @duration_minutes, @price, @capacity,
            @level, @includes, @takeaway, @image, @kind, 1, @sort)
  `);
  const insertSession = db.prepare(`
    INSERT INTO workshop_sessions (workshop_id, starts_at, ends_at, location, capacity, price, status, note)
    VALUES (@workshop_id, @starts_at, @ends_at, @location, @capacity, @price, @status, @note)
  `);
  const stats = { workshops: 0, sessions: 0 };

  return db.transaction(() => {
    for (const w of workshops) {
      const { lastInsertRowid } = insertWorkshop.run({
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
      });
      stats.workshops++;
      for (const s of w.sessions || []) {
        insertSession.run({
          workshop_id: lastInsertRowid,
          starts_at: warsawToUtc(s.start),
          ends_at: warsawToUtc(s.end),
          location: s.location || DEFAULT_LOCATION,
          capacity: s.capacity ?? null,
          price: s.price ?? null,
          status: ['open', 'closed', 'cancelled'].includes(s.status) ? s.status : 'open',
          note: s.note ?? null,
        });
        stats.sessions++;
      }
    }
    return stats;
  })();
}

// Pierwsze uruchomienie (puste tabele) - wczytaj przykładową ofertę, żeby strona
// od razu miała treść. Zwraca null, gdy nic nie było do zrobienia.
function seedIfEmpty() {
  const result = {};
  if (count('products') === 0) result.products = syncProducts();
  const imported = importWorkshops();
  if (imported) result.workshops = imported;
  return Object.keys(result).length ? result : null;
}

module.exports = { syncProducts, importWorkshops, seedIfEmpty };
