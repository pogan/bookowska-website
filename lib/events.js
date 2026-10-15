// Zarządzanie wydarzeniami z panelu (/admin/wydarzenia): rodzaje warsztatów i
// ich terminy. Od kiedy istnieje panel, to baza jest źródłem prawdy -
// db/seed/workshops.json trafia tylko do pustej bazy (lib/seed.js).
//
// Reguły chroniące zgłoszenia uczestników:
// - terminu ze zgłoszeniami nie da się usunąć (można go odwołać) ani przepiąć
//   do innego rodzaju warsztatów;
// - limit miejsc nie może spaść poniżej liczby już zapisanych osób;
// - rodzaju z terminami lub zgłoszeniami nie da się usunąć (można go ukryć).
const db = require('../db');
const workshops = require('./workshops');
const { plural, dateNum } = require('./format');

class EventError extends Error {}

const isUniqueViolation = (err) => Boolean(err && err.code === 'SQLITE_CONSTRAINT_UNIQUE');

const WORKSHOP_FIELDS = [
  'slug', 'title', 'summary', 'description', 'program', 'duration_minutes', 'price', 'capacity',
  'level', 'includes', 'takeaway', 'image', 'kind', 'is_active', 'sort',
];
const SESSION_FIELDS = ['workshop_id', 'starts_at', 'ends_at', 'location', 'capacity', 'price', 'status', 'note'];

const stmts = {
  workshops: db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM workshop_sessions s WHERE s.workshop_id = w.id) AS session_count,
      (SELECT COUNT(*) FROM workshop_sessions s WHERE s.workshop_id = w.id AND s.starts_at > @now) AS upcoming_count,
      (SELECT COUNT(*) FROM workshop_signups g WHERE g.workshop_id = w.id) AS signup_count
    FROM workshops w
    ORDER BY w.is_active DESC, w.sort, w.id
  `),
  workshop: db.prepare('SELECT * FROM workshops WHERE id = ?'),
  workshopWithUsage: db.prepare(`
    SELECT w.*,
      (SELECT COUNT(*) FROM workshop_sessions s WHERE s.workshop_id = w.id) AS session_count,
      (SELECT COUNT(*) FROM workshop_signups g WHERE g.workshop_id = w.id) AS signup_count
    FROM workshops w WHERE w.id = ?
  `),
  insertWorkshop: db.prepare(`
    INSERT INTO workshops (${WORKSHOP_FIELDS.join(', ')})
    VALUES (${WORKSHOP_FIELDS.map((f) => `@${f}`).join(', ')})
  `),
  updateWorkshop: db.prepare(`
    UPDATE workshops SET ${WORKSHOP_FIELDS.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id
  `),
  deleteWorkshop: db.prepare('DELETE FROM workshops WHERE id = ?'),
  workshopUsage: db.prepare(`
    SELECT (SELECT COUNT(*) FROM workshop_sessions WHERE workshop_id = @id) AS sessions,
           (SELECT COUNT(*) FROM workshop_signups WHERE workshop_id = @id) AS signups
  `),

  upcoming: db.prepare(`
    SELECT ${workshops.SESSION_COLUMNS},
      (SELECT COUNT(*) FROM workshop_signups g WHERE g.session_id = s.id AND g.status != 'cancelled') AS signup_count
    FROM workshop_sessions s JOIN workshops w ON w.id = s.workshop_id
    WHERE s.starts_at > ?
    ORDER BY s.starts_at
  `),
  past: db.prepare(`
    SELECT ${workshops.SESSION_COLUMNS},
      (SELECT COUNT(*) FROM workshop_signups g WHERE g.session_id = s.id AND g.status != 'cancelled') AS signup_count
    FROM workshop_sessions s JOIN workshops w ON w.id = s.workshop_id
    WHERE s.starts_at <= ?
    ORDER BY s.starts_at DESC
    LIMIT ?
  `),
  signupsOfSession: db.prepare('SELECT * FROM workshop_signups WHERE session_id = ? ORDER BY id'),
  insertSession: db.prepare(`
    INSERT INTO workshop_sessions (${SESSION_FIELDS.join(', ')})
    VALUES (${SESSION_FIELDS.map((f) => `@${f}`).join(', ')})
  `),
  updateSession: db.prepare(`
    UPDATE workshop_sessions SET ${SESSION_FIELDS.map((f) => `${f} = @${f}`).join(', ')} WHERE id = @id
  `),
  deleteSession: db.prepare('DELETE FROM workshop_sessions WHERE id = ?'),
  signupCount: db.prepare('SELECT COUNT(*) AS n FROM workshop_signups WHERE session_id = ?'),
  // Przyszłe terminy bez własnego limitu, na które zapisało się więcej osób,
  // niż wynosiłby nowy limit rodzaju warsztatów.
  overbookedIfCapacity: db.prepare(`
    SELECT s.starts_at, (SELECT COALESCE(SUM(g.participants), 0) FROM workshop_signups g
                         WHERE g.session_id = s.id AND g.status != 'cancelled') AS taken
    FROM workshop_sessions s
    WHERE s.workshop_id = @id AND s.capacity IS NULL AND s.starts_at > @now
  `),
};

function pick(data, fields) {
  return Object.fromEntries(fields.map((f) => [f, data[f] === undefined ? null : data[f]]));
}

// --- Rodzaje warsztatów ----------------------------------------------------

function listWorkshops() {
  return stmts.workshops.all({ now: new Date().toISOString() }).map(workshops.hydrateWorkshop);
}

function getWorkshop(id) {
  return workshops.hydrateWorkshop(stmts.workshopWithUsage.get(id));
}

function createWorkshop(data) {
  try {
    return Number(stmts.insertWorkshop.run(pick(data, WORKSHOP_FIELDS)).lastInsertRowid);
  } catch (err) {
    if (isUniqueViolation(err)) throw new EventError(`Adres /warsztaty/${data.slug} jest już zajęty — zmień nazwę albo adres.`);
    throw err;
  }
}

const updateWorkshopTx = db.transaction((id, data) => {
  if (!stmts.workshop.get(id)) throw new EventError('Nie ma takiego rodzaju warsztatów.');
  const tooSmall = stmts.overbookedIfCapacity
    .all({ id, now: new Date().toISOString() })
    .find((s) => s.taken > data.capacity);
  if (tooSmall) {
    throw new EventError(
      `Na termin ${dateNum(tooSmall.starts_at)} ${plural(tooSmall.taken, 'zapisała się', 'zapisały się', 'zapisało się')} już ${tooSmall.taken} ${plural(tooSmall.taken, 'osoba', 'osoby', 'osób')} — limit nie może być mniejszy (albo ustaw limit w samym terminie).`,
    );
  }
  stmts.updateWorkshop.run({ ...pick(data, WORKSHOP_FIELDS), id });
});

function updateWorkshop(id, data) {
  try {
    updateWorkshopTx(id, data);
  } catch (err) {
    if (isUniqueViolation(err)) throw new EventError(`Adres /warsztaty/${data.slug} jest już zajęty — wybierz inny.`);
    throw err;
  }
}

const deleteWorkshopTx = db.transaction((id) => {
  const usage = stmts.workshopUsage.get({ id });
  if (usage.sessions || usage.signups) {
    throw new EventError('Ten rodzaj ma terminy albo zgłoszenia — zamiast usuwać, ukryj go (odznacz „widoczny na stronie”).');
  }
  if (stmts.deleteWorkshop.run(id).changes === 0) throw new EventError('Nie ma takiego rodzaju warsztatów.');
});

function deleteWorkshop(id) {
  deleteWorkshopTx(id);
}

// --- Terminy -----------------------------------------------------------------

function listSessions({ pastLimit = 30 } = {}) {
  const now = new Date().toISOString();
  return {
    upcoming: stmts.upcoming.all(now).map(workshops.hydrateSession),
    past: stmts.past.all(now, pastLimit).map(workshops.hydrateSession),
  };
}

function getSession(id) {
  const session = workshops.getSession(id);
  if (!session) return null;
  session.signups = stmts.signupsOfSession.all(id);
  return session;
}

function createSession(data) {
  if (!stmts.workshop.get(data.workshop_id)) throw new EventError('Wybierz rodzaj warsztatów.');
  try {
    return Number(stmts.insertSession.run(pick(data, SESSION_FIELDS)).lastInsertRowid);
  } catch (err) {
    if (isUniqueViolation(err)) throw new EventError('Te warsztaty mają już termin o tej samej godzinie rozpoczęcia.');
    throw err;
  }
}

const updateSessionTx = db.transaction((id, data) => {
  const current = workshops.getSession(id);
  if (!current) throw new EventError('Nie ma takiego terminu.');
  const workshop = stmts.workshop.get(data.workshop_id);
  if (!workshop) throw new EventError('Wybierz rodzaj warsztatów.');
  const signups = stmts.signupCount.get(id).n;
  if (signups && data.workshop_id !== current.workshop_id) {
    throw new EventError('Na ten termin są zgłoszenia — nie można przenieść go do innych warsztatów. Odwołaj go i dodaj nowy.');
  }
  const seats = data.capacity ?? workshop.capacity;
  if (seats < current.taken) {
    throw new EventError(
      `Zapisanych jest już ${current.taken} ${plural(current.taken, 'osoba', 'osoby', 'osób')} — limit miejsc nie może być mniejszy.`,
    );
  }
  stmts.updateSession.run({ ...pick(data, SESSION_FIELDS), id });
});

function updateSession(id, data) {
  try {
    updateSessionTx(id, data);
  } catch (err) {
    if (isUniqueViolation(err)) throw new EventError('Te warsztaty mają już termin o tej samej godzinie rozpoczęcia.');
    throw err;
  }
}

const deleteSessionTx = db.transaction((id) => {
  if (stmts.signupCount.get(id).n) {
    throw new EventError('Na ten termin są zgłoszenia — nie można go usunąć. Zmień status na „odwołany”.');
  }
  if (stmts.deleteSession.run(id).changes === 0) throw new EventError('Nie ma takiego terminu.');
});

function deleteSession(id) {
  deleteSessionTx(id);
}

module.exports = {
  EventError,
  listWorkshops,
  getWorkshop,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
  listSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
};
