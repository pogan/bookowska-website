require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const { seedIfEmpty, importWorkshops, syncProducts } = require('../lib/seed');
const workshops = require('../lib/workshops');
const { warsawToUtc } = require('../lib/format');

seedIfEmpty();

// Własny, przyszły termin z małą grupą - niezależny od dat w seedzie.
const workshop = workshops.getWorkshop('oprawa-japonska');
const startsAt = new Date(Date.now() + 7 * 864e5).toISOString();
const { lastInsertRowid: sessionId } = db
  .prepare("INSERT INTO workshop_sessions (workshop_id, starts_at, ends_at, location, capacity) VALUES (?, ?, ?, 'Sopot', 3)")
  .run(workshop.id, startsAt, new Date(Date.now() + 7 * 864e5 + 3 * 36e5).toISOString());

const signup = (participants, extra = {}) =>
  workshops.createSignup({
    kind: 'session',
    workshopId: workshop.id,
    sessionId,
    name: 'Jan Testowy',
    email: 'jan@example.com',
    participants,
    ...extra,
  });

test('zgłoszenia zajmują miejsca do wyczerpania limitu grupy', () => {
  signup(2);
  assert.equal(workshops.getSession(sessionId).seatsLeft, 1);
  assert.throws(() => signup(2), workshops.SignupError);
  signup(1);
  const s = workshops.getSession(sessionId);
  assert.equal(s.isFull, true);
  assert.equal(s.canSignUp, false);
  assert.throws(() => signup(1), /pełny/);
});

test('wycofane zgłoszenie zwalnia miejsce', () => {
  db.prepare("UPDATE workshop_signups SET status = 'cancelled' WHERE session_id = ? AND participants = 1").run(sessionId);
  assert.equal(workshops.getSession(sessionId).seatsLeft, 1);
});

test('termin innego warsztatu albo miniony - odrzucony', () => {
  const other = workshops.getWorkshop('notes-w-twardej-oprawie');
  assert.throws(
    () => workshops.createSignup({ kind: 'session', workshopId: other.id, sessionId, name: 'X Y', email: 'x@example.com', participants: 1 }),
    workshops.SignupError,
  );
  const { lastInsertRowid: pastId } = db
    .prepare("INSERT INTO workshop_sessions (workshop_id, starts_at, ends_at, location) VALUES (?, '2020-01-01T10:00:00.000Z', '2020-01-01T13:00:00.000Z', 'Sopot')")
    .run(workshop.id);
  assert.throws(() => signup(1, { sessionId: pastId }), workshops.SignupError);
});

test('zapytanie (bez terminu) nie zależy od limitu miejsc', () => {
  const s = workshops.createSignup({ kind: 'request', workshopId: workshop.id, sessionId: null, name: 'Firma', email: 'hr@example.com', participants: 25, message: 'Integracja zespołu w grudniu' });
  assert.equal(s.kind, 'request');
  assert.equal(s.session_id, null);
});

test('lista warsztatów pokazuje tylko przyszłe terminy, w kolejności', () => {
  const list = workshops.upcomingSessions();
  assert.ok(list.every((s) => new Date(s.starts_at) > new Date()));
  const times = list.map((s) => s.starts_at);
  assert.deepEqual(times, [...times].sort());
});

test('warsztaty z pliku tylko do pustej bazy - zmiany z panelu przetrwają seed', () => {
  db.prepare("UPDATE workshops SET title = 'Zmienione w panelu' WHERE id = ?").run(workshop.id);
  const sessionsBefore = db.prepare('SELECT COUNT(*) AS n FROM workshop_sessions').get().n;
  assert.equal(importWorkshops(), null);
  syncProducts();
  assert.equal(db.prepare('SELECT title FROM workshops WHERE id = ?').get(workshop.id).title, 'Zmienione w panelu');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM workshop_sessions').get().n, sessionsBefore);
  assert.equal(seedIfEmpty(), null);
  assert.equal(warsawToUtc('2026-11-07 10:00'), '2026-11-07T09:00:00.000Z');
});
