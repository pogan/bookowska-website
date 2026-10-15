const { startServer, client, sessionCookie } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db');
const forms = require('../lib/forms');
const { slugify } = require('../lib/slug');

let srv;
let admin;
test.before(async () => {
  srv = await startServer();
  admin = client(srv.base, { cookie: sessionCookie() });
});
test.after(() => srv.close());

const workshopForm = (extra = {}) => ({
  title: 'Pudełko na zdjęcia',
  summary: 'Klejone pudło z tektury introligatorskiej obciągnięte płótnem.',
  program: '- tektura i cięcie\n- klejenie\n2 rodzaje narożników',
  duration: '180',
  price: '190',
  capacity: '6',
  kind: 'open',
  is_active: 'on',
  image: 'nozyczki',
  ...extra,
});
const sessionForm = (workshopId, extra = {}) => ({
  workshop_id: String(workshopId),
  date: '2030-12-19',
  start: '10:00',
  end: '13:00',
  location: 'Pracownia Bookowska, Sopot',
  capacity: '',
  price: '',
  note: '',
  status: 'open',
  ...extra,
});
const sessionRow = (id) => db.prepare('SELECT * FROM workshop_sessions WHERE id = ?').get(id);
const idFrom = (location) => Number(location.split('/').pop());

test('slug z polskich znaków i program z listy', () => {
  assert.equal(slugify('Oprawa półpłócienna — ŻÓŁĆ!'), 'oprawa-polplocienna-zolc');
  const { data, errors } = forms.workshopForm(workshopForm(), { imageKeys: ['nozyczki'] });
  assert.deepEqual(errors, {});
  assert.deepEqual(JSON.parse(data.program), ['tektura i cięcie', 'klejenie', '2 rodzaje narożników']);
  assert.equal(data.price, 19000);
  const bad = forms.sessionForm(sessionForm(1, { start: '12:00', end: '11:00', date: '2030-02-30' }), { workshopIds: [1] });
  assert.ok(bad.errors.end && bad.errors.date);
});

test('panel wydarzeń tylko dla administratora', async () => {
  const anon = client(srv.base);
  const page = await anon.get('/admin/wydarzenia');
  assert.equal(page.status, 302);
  assert.equal(page.location, '/admin');
  assert.equal((await anon.post('/admin/wydarzenia/rodzaje', workshopForm())).status, 302);

  const stranger = client(srv.base, { cookie: sessionCookie('obcy@example.org') });
  assert.equal((await stranger.get('/admin/wydarzenia')).status, 403);
  assert.equal((await stranger.post('/admin/wydarzenia/rodzaje', workshopForm())).status, 403);

  assert.equal((await admin.get('/admin/wydarzenia')).status, 200);
});

test('CRUD: rodzaj i termin, widoczne na stronie publicznej', async () => {
  const created = await admin.post('/admin/wydarzenia/rodzaje', workshopForm());
  assert.equal(created.status, 303);
  const workshopId = idFrom(created.location);
  assert.equal(db.prepare('SELECT slug FROM workshops WHERE id = ?').get(workshopId).slug, 'pudelko-na-zdjecia');

  const dup = await admin.post('/admin/wydarzenia/rodzaje', workshopForm({ summary: 'Drugi raz ten sam adres strony.' }));
  assert.equal(dup.status, 409);
  assert.match(dup.text, /jest już zajęty/);

  const invalid = await admin.post('/admin/wydarzenia/terminy', sessionForm(workshopId, { end: '09:00' }));
  assert.equal(invalid.status, 422);

  const session = await admin.post('/admin/wydarzenia/terminy', sessionForm(workshopId, { note: 'przed świętami' }));
  assert.equal(session.status, 303);
  const sessionId = idFrom(session.location);
  assert.equal(sessionRow(sessionId).starts_at, '2030-12-19T09:00:00.000Z');

  const same = await admin.post('/admin/wydarzenia/terminy', sessionForm(workshopId, { end: '12:00' }));
  assert.equal(same.status, 409);

  const calendar = await client(srv.base).get('/warsztaty');
  assert.match(calendar.text, /Pudełko na zdjęcia/);
  assert.match(calendar.text, /przed świętami/);
});

test('reguły chroniące zgłoszenia uczestników', async () => {
  const workshopId = db.prepare("SELECT id FROM workshops WHERE slug = 'pudelko-na-zdjecia'").get().id;
  const sessionId = db.prepare('SELECT id FROM workshop_sessions WHERE workshop_id = ?').get(workshopId).id;

  const visitor = client(srv.base);
  const signup = await visitor.post(`/warsztaty/pudelko-na-zdjecia/zapis?termin=${sessionId}`, {
    name: 'Ewa Testowa',
    email: 'ewa@example.com',
    participants: '2',
  });
  assert.equal(signup.status, 303);

  const edit = await admin.get(`/admin/wydarzenia/terminy/${sessionId}`);
  assert.match(edit.text, /ewa@example\.com/);
  assert.match(edit.text, /Napisz do zapisanych/);

  const tooSmall = await admin.post(`/admin/wydarzenia/terminy/${sessionId}`, sessionForm(workshopId, { capacity: '1' }));
  assert.equal(tooSmall.status, 409);
  assert.match(tooSmall.text, /Zapisanych jest już 2 osoby/);

  const otherId = db.prepare("SELECT id FROM workshops WHERE slug = 'oprawa-japonska'").get().id;
  const moved = await admin.post(`/admin/wydarzenia/terminy/${sessionId}`, sessionForm(otherId));
  assert.equal(moved.status, 409);

  const typeTooSmall = await admin.post(`/admin/wydarzenia/rodzaje/${workshopId}`, workshopForm({ capacity: '1' }));
  assert.equal(typeTooSmall.status, 409);

  // Odwołanie + zmiana godziny i ceny.
  const cancel = await admin.post(`/admin/wydarzenia/terminy/${sessionId}`, sessionForm(workshopId, { start: '11:00', end: '14:00', price: '210,50', status: 'cancelled' }));
  assert.equal(cancel.status, 303);
  const row = sessionRow(sessionId);
  assert.equal(row.status, 'cancelled');
  assert.equal(row.price, 21050);
  assert.match((await visitor.get('/warsztaty/pudelko-na-zdjecia')).text, /odwołane/);
  // Na odwołany termin nie da się już zapisać.
  const late = await visitor.post(`/warsztaty/pudelko-na-zdjecia/zapis?termin=${sessionId}`, { name: 'Jan Spóźniony', email: 'jan@example.com', participants: '1' });
  assert.equal(late.status, 422);

  // Terminu ze zgłoszeniami nie da się usunąć, rodzaju z terminami też nie.
  assert.equal((await admin.post(`/admin/wydarzenia/terminy/${sessionId}/usun`, {})).status, 303);
  assert.ok(sessionRow(sessionId));
  assert.equal((await admin.post(`/admin/wydarzenia/rodzaje/${workshopId}/usun`, {})).status, 303);
  assert.ok(db.prepare('SELECT 1 FROM workshops WHERE id = ?').get(workshopId));

  // Termin bez zgłoszeń - usuwa się.
  const extra = await admin.post('/admin/wydarzenia/terminy', sessionForm(workshopId, { date: '2031-01-09' }));
  const extraId = idFrom(extra.location);
  assert.equal((await admin.post(`/admin/wydarzenia/terminy/${extraId}/usun`, {})).status, 303);
  assert.equal(sessionRow(extraId), undefined);

  // Ukrycie rodzaju chowa go ze strony.
  const hide = await admin.post(`/admin/wydarzenia/rodzaje/${workshopId}`, workshopForm({ is_active: '' }));
  assert.equal(hide.status, 303);
  assert.equal((await visitor.get('/warsztaty/pudelko-na-zdjecia')).status, 404);
});

test('nowy rodzaj bez terminów i zgłoszeń można usunąć', async () => {
  const created = await admin.post('/admin/wydarzenia/rodzaje', workshopForm({ title: 'Do usunięcia', summary: 'Rodzaj utworzony tylko na chwilę.' }));
  const id = idFrom(created.location);
  const removed = await admin.post(`/admin/wydarzenia/rodzaje/${id}/usun`, {});
  assert.equal(removed.status, 303);
  assert.equal(removed.location, '/admin/wydarzenia');
  assert.equal(db.prepare('SELECT 1 FROM workshops WHERE id = ?').get(id), undefined);
});
