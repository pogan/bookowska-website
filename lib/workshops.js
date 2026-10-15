// Warsztaty, terminy i zgłoszenia. Miejsca zajmują wszystkie zgłoszenia poza
// wycofanymi ('cancelled') - na tym etapie pracownia potwierdza je mailowo, więc
// nowe zgłoszenie od razu blokuje miejsce, żeby nie przyjąć za dużej grupy.
const db = require('../db');
const { plural } = require('./format');

const SESSION_COLUMNS = `
  s.*, w.slug AS workshop_slug, w.title AS workshop_title, w.duration_minutes, w.image AS workshop_image,
  COALESCE(s.capacity, w.capacity) AS seats,
  COALESCE(s.price, w.price) AS session_price,
  (SELECT COALESCE(SUM(g.participants), 0) FROM workshop_signups g
     WHERE g.session_id = s.id AND g.status != 'cancelled') AS taken
`;

const stmts = {
  workshops: db.prepare('SELECT * FROM workshops WHERE is_active = 1 ORDER BY sort, id'),
  workshopBySlug: db.prepare('SELECT * FROM workshops WHERE slug = ? AND is_active = 1'),
  workshopById: db.prepare('SELECT * FROM workshops WHERE id = ?'),
  upcoming: db.prepare(`
    SELECT ${SESSION_COLUMNS}
    FROM workshop_sessions s JOIN workshops w ON w.id = s.workshop_id
    WHERE w.is_active = 1 AND s.starts_at > ? AND (@workshopId IS NULL OR s.workshop_id = @workshopId)
    ORDER BY s.starts_at
    LIMIT @limit
  `),
  session: db.prepare(`
    SELECT ${SESSION_COLUMNS}
    FROM workshop_sessions s JOIN workshops w ON w.id = s.workshop_id
    WHERE s.id = ?
  `),
  insertSignup: db.prepare(`
    INSERT INTO workshop_signups (workshop_id, session_id, kind, name, email, phone, participants, message)
    VALUES (@workshop_id, @session_id, @kind, @name, @email, @phone, @participants, @message)
  `),
  signupById: db.prepare('SELECT * FROM workshop_signups WHERE id = ?'),
  recentSignups: db.prepare(`
    SELECT g.*, w.title AS workshop_title, s.starts_at
    FROM workshop_signups g
    LEFT JOIN workshops w ON w.id = g.workshop_id
    LEFT JOIN workshop_sessions s ON s.id = g.session_id
    ORDER BY g.id DESC LIMIT ?
  `),
};

class SignupError extends Error {}

function hydrateWorkshop(row) {
  if (!row) return null;
  return { ...row, program: JSON.parse(row.program || '[]'), isRequest: row.kind === 'request' };
}

function hydrateSession(row) {
  if (!row) return null;
  const seatsLeft = Math.max(0, row.seats - row.taken);
  return {
    ...row,
    price: row.session_price,
    seatsLeft,
    isFull: seatsLeft === 0,
    isCancelled: row.status === 'cancelled',
    isPast: new Date(row.starts_at) <= new Date(),
    canSignUp: row.status === 'open' && seatsLeft > 0 && new Date(row.starts_at) > new Date(),
  };
}

function upcomingSessions({ workshopId = null, limit = 50 } = {}) {
  return stmts.upcoming.all(new Date().toISOString(), { workshopId, limit }).map(hydrateSession);
}

function listWorkshops() {
  const sessions = upcomingSessions();
  return stmts.workshops.all().map((row) => {
    const w = hydrateWorkshop(row);
    w.sessions = sessions.filter((s) => s.workshop_id === w.id);
    return w;
  });
}

function getWorkshop(slug) {
  const w = hydrateWorkshop(stmts.workshopBySlug.get(slug));
  if (w) w.sessions = upcomingSessions({ workshopId: w.id });
  return w;
}

function getWorkshopById(id) {
  return hydrateWorkshop(stmts.workshopById.get(id));
}

function getSession(id) {
  return hydrateSession(stmts.session.get(id));
}

// Sprawdzenie miejsc i zapis w jednej transakcji - dwa równoległe zgłoszenia
// nie przekroczą limitu grupy.
const createTx = db.transaction((input) => {
  if (input.kind === 'session') {
    const session = getSession(input.sessionId);
    if (!session || session.workshop_id !== input.workshopId || !session.canSignUp) {
      throw new SignupError(
        session && session.isFull
          ? 'Ten termin jest już pełny. Napisz do mnie — dopiszę Cię do listy rezerwowej.'
          : 'Na ten termin nie można się już zapisać.',
      );
    }
    if (input.participants > session.seatsLeft) {
      throw new SignupError(
        `Na ten termin ${plural(session.seatsLeft, 'zostało', 'zostały', 'zostało')} już tylko ${session.seatsLeft} ${plural(session.seatsLeft, 'miejsce', 'miejsca', 'miejsc')}.`,
      );
    }
  }
  const { lastInsertRowid } = stmts.insertSignup.run({
    workshop_id: input.workshopId,
    session_id: input.kind === 'session' ? input.sessionId : null,
    kind: input.kind,
    name: input.name,
    email: input.email,
    phone: input.phone || null,
    participants: input.participants,
    message: input.message || null,
  });
  return stmts.signupById.get(lastInsertRowid);
});

function createSignup(input) {
  return createTx(input);
}

const SIGNUP_EMAIL_COLUMNS = new Set(['studio_notified_at', 'confirmation_sent_at']);
function markSignupEmail(id, column) {
  if (!SIGNUP_EMAIL_COLUMNS.has(column)) throw new Error(`Nieznana kolumna: ${column}`);
  db.prepare(`UPDATE workshop_signups SET ${column} = datetime('now') WHERE id = ?`).run(id);
}

module.exports = {
  SignupError,
  listWorkshops,
  getWorkshop,
  getWorkshopById,
  getSession,
  upcomingSessions,
  createSignup,
  markSignupEmail,
  recentSignups: (limit = 100) => stmts.recentSignups.all(limit),
};
