// Panel -> Wydarzenia: terminy i rodzaje warsztatów (CRUD). Montowany w
// routes/admin.js za strażnikiem uprawnień, więc każda trasa wymaga admina;
// ochronę CSRF zapewnia sameOriginPost (lib/security.js).
const express = require('express');
const site = require('../lib/site');
const forms = require('../lib/forms');
const events = require('../lib/events');
const manifest = require('../lib/imageManifest.json');
const { warsawParts, moneyInput, dateNum } = require('../lib/format');

const router = express.Router();

const IMAGE_KEYS = Object.keys(manifest);
const DEFAULT_LOCATION = 'Pracownia Bookowska, Sopot';

const page = { noindex: true, bodyClass: 'page-admin', adminSection: 'wydarzenia' };

function flash(req, type, text) {
  req.session.flash = { type, text };
}

function idParam(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get('/', (req, res) => {
  const { upcoming, past } = events.listSessions();
  res.page('admin/events', {
    ...page,
    title: `Wydarzenia | Panel | ${site.name}`,
    upcoming,
    past,
    workshops: events.listWorkshops(),
  });
});

// --- Terminy -----------------------------------------------------------------

function renderSessionForm(res, { session = null, values, errors = {}, formError = null, status = 200 }) {
  res.status(status).page('admin/session-form', {
    ...page,
    title: `${session ? `Termin ${dateNum(session.starts_at)}` : 'Nowy termin'} | Panel | ${site.name}`,
    session,
    values,
    errors,
    formError,
    workshops: events.listWorkshops(),
  });
}

function sessionValues(session) {
  const start = warsawParts(session.starts_at);
  const end = warsawParts(session.ends_at);
  return {
    workshop_id: String(session.workshop_id),
    date: start.date,
    start: start.time,
    end: end.time,
    location: session.location,
    capacity: session.capacity === null ? '' : String(session.capacity),
    price: moneyInput(session.ownPrice),
    note: session.note || '',
    status: session.status,
  };
}

router.get('/terminy/nowy', (req, res) => {
  const list = events.listWorkshops();
  const requested = list.find((w) => w.id === Number(req.query.warsztat));
  const fallback = list.find((w) => w.is_active && w.kind === 'open') || list[0];
  const workshop = requested || fallback;
  renderSessionForm(res, {
    values: {
      workshop_id: workshop ? String(workshop.id) : '',
      date: '',
      start: '10:00',
      end: '14:00',
      location: DEFAULT_LOCATION,
      capacity: '',
      price: '',
      note: '',
      status: 'open',
    },
  });
});

router.post('/terminy', (req, res) => {
  const workshopIds = events.listWorkshops().map((w) => w.id);
  const { values, errors, data } = forms.sessionForm(req.body || {}, { workshopIds });
  if (Object.keys(errors).length) return renderSessionForm(res, { values, errors, status: 422 });
  try {
    const id = events.createSession(data);
    flash(req, 'success', `Dodano termin ${values.date.split('-').reverse().join('.')}, ${values.start}.`);
    return res.redirect(303, `/admin/wydarzenia/terminy/${id}`);
  } catch (err) {
    if (err instanceof events.EventError) return renderSessionForm(res, { values, formError: err.message, status: 409 });
    throw err;
  }
});

router.get('/terminy/:id', (req, res, next) => {
  const session = events.getSession(idParam(req));
  if (!session) return next();
  renderSessionForm(res, { session, values: sessionValues(session) });
});

router.post('/terminy/:id', (req, res, next) => {
  const session = events.getSession(idParam(req));
  if (!session) return next();
  const workshopIds = events.listWorkshops().map((w) => w.id);
  const { values, errors, data } = forms.sessionForm(req.body || {}, { workshopIds });
  if (Object.keys(errors).length) return renderSessionForm(res, { session, values, errors, status: 422 });
  try {
    events.updateSession(session.id, data);
    flash(req, 'success', 'Zapisano zmiany terminu.');
    return res.redirect(303, `/admin/wydarzenia/terminy/${session.id}`);
  } catch (err) {
    if (err instanceof events.EventError) return renderSessionForm(res, { session, values, formError: err.message, status: 409 });
    throw err;
  }
});

router.post('/terminy/:id/usun', (req, res, next) => {
  const session = events.getSession(idParam(req));
  if (!session) return next();
  try {
    events.deleteSession(session.id);
    flash(req, 'success', `Usunięto termin ${dateNum(session.starts_at)} (${session.workshop_title}).`);
    return res.redirect(303, '/admin/wydarzenia');
  } catch (err) {
    if (!(err instanceof events.EventError)) throw err;
    flash(req, 'warning', err.message);
    return res.redirect(303, `/admin/wydarzenia/terminy/${session.id}`);
  }
});

// --- Rodzaje warsztatów --------------------------------------------------------

function renderWorkshopForm(res, { workshop = null, values, errors = {}, formError = null, status = 200 }) {
  let sessions = [];
  if (workshop) {
    const all = events.listSessions({ pastLimit: 200 });
    sessions = [...all.upcoming, ...all.past].filter((s) => s.workshop_id === workshop.id);
  }
  res.status(status).page('admin/workshop-form', {
    ...page,
    title: `${workshop ? workshop.title : 'Nowy rodzaj warsztatów'} | Panel | ${site.name}`,
    workshop,
    sessions,
    values,
    errors,
    formError,
    imageKeys: IMAGE_KEYS,
  });
}

function workshopValues(w) {
  return {
    title: w.title,
    slug: w.slug,
    kind: w.kind,
    summary: w.summary,
    description: w.description,
    program: w.program.join('\n'),
    duration: w.duration_minutes === null ? '' : String(w.duration_minutes),
    price: moneyInput(w.price),
    capacity: String(w.capacity),
    level: w.level || '',
    includes: w.includes || '',
    takeaway: w.takeaway || '',
    image: w.image || '',
    sort: String(w.sort),
    is_active: w.is_active === 1,
  };
}

router.get('/rodzaje/nowy', (req, res) => {
  renderWorkshopForm(res, {
    values: { kind: 'open', capacity: '8', duration: '180', sort: '0', is_active: true, image: '' },
  });
});

router.post('/rodzaje', (req, res) => {
  const { values, errors, data } = forms.workshopForm(req.body || {}, { imageKeys: IMAGE_KEYS });
  if (Object.keys(errors).length) return renderWorkshopForm(res, { values, errors, status: 422 });
  try {
    const id = events.createWorkshop(data);
    flash(req, 'success', `Dodano warsztaty „${data.title}”. Teraz możesz dodać im terminy.`);
    return res.redirect(303, `/admin/wydarzenia/rodzaje/${id}`);
  } catch (err) {
    if (err instanceof events.EventError) return renderWorkshopForm(res, { values, formError: err.message, status: 409 });
    throw err;
  }
});

router.get('/rodzaje/:id', (req, res, next) => {
  const workshop = events.getWorkshop(idParam(req));
  if (!workshop) return next();
  renderWorkshopForm(res, { workshop, values: workshopValues(workshop) });
});

router.post('/rodzaje/:id', (req, res, next) => {
  const workshop = events.getWorkshop(idParam(req));
  if (!workshop) return next();
  const { values, errors, data } = forms.workshopForm(req.body || {}, { imageKeys: IMAGE_KEYS });
  if (Object.keys(errors).length) return renderWorkshopForm(res, { workshop, values, errors, status: 422 });
  try {
    events.updateWorkshop(workshop.id, data);
    flash(req, 'success', 'Zapisano zmiany warsztatów.');
    return res.redirect(303, `/admin/wydarzenia/rodzaje/${workshop.id}`);
  } catch (err) {
    if (err instanceof events.EventError) return renderWorkshopForm(res, { workshop, values, formError: err.message, status: 409 });
    throw err;
  }
});

router.post('/rodzaje/:id/usun', (req, res, next) => {
  const workshop = events.getWorkshop(idParam(req));
  if (!workshop) return next();
  try {
    events.deleteWorkshop(workshop.id);
    flash(req, 'success', `Usunięto warsztaty „${workshop.title}”.`);
    return res.redirect(303, '/admin/wydarzenia');
  } catch (err) {
    if (!(err instanceof events.EventError)) throw err;
    flash(req, 'warning', err.message);
    return res.redirect(303, `/admin/wydarzenia/rodzaje/${workshop.id}`);
  }
});

module.exports = { router };
