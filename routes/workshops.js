const express = require('express');
const site = require('../lib/site');
const seo = require('../lib/seo');
const forms = require('../lib/forms');
const workshops = require('../lib/workshops');
const notifications = require('../lib/notifications');
const { limits } = require('../lib/security');
const { dateNum } = require('../lib/format');

const router = express.Router();

// Jedno zgłoszenie obejmuje najwyżej tylu uczestników (większe grupy - zapytanie).
const MAX_PER_SIGNUP = 6;
const MAX_PER_REQUEST = 60;

const crumbs = (...extra) => seo.breadcrumbs([{ name: 'Start', path: '/' }, { name: 'Warsztaty', path: '/warsztaty' }, ...extra]);

router.get('/warsztaty', (req, res) => {
  const list = workshops.listWorkshops();
  const sessions = workshops.upcomingSessions();
  const bySlug = Object.fromEntries(list.map((w) => [w.slug, w]));
  res.page('workshops/index', {
    title: `Warsztaty introligatorskie w Sopocie | ${site.name}`,
    description:
      'Warsztaty introligatorskie w Sopocie w małych grupach: notes w twardej oprawie, oprawa japońska, oprawa półpłócienna. Warsztaty dla grup i firm, prelekcje o historii książki.',
    canonicalPath: '/warsztaty',
    ogImageKey: 'warsztaty-pomiar',
    open: list.filter((w) => !w.isRequest),
    onRequest: list.filter((w) => w.isRequest),
    sessions,
    jsonLd: [
      crumbs(),
      ...sessions.slice(0, 12).map((s) => seo.eventSchema(bySlug[s.workshop_slug], s)),
    ],
  });
});

router.get('/warsztaty/:slug', (req, res, next) => {
  const workshop = workshops.getWorkshop(req.params.slug);
  if (!workshop) return next();
  res.page('workshops/show', {
    title: `${workshop.title} — warsztaty introligatorskie | ${site.name}`,
    description: workshop.summary,
    canonicalPath: `/warsztaty/${workshop.slug}`,
    ogImageKey: workshop.image,
    workshop,
    jsonLd: [
      crumbs({ name: workshop.title, path: `/warsztaty/${workshop.slug}` }),
      ...workshop.sessions.map((s) => seo.eventSchema(workshop, s)),
    ],
  });
});

// Kontekst formularza: konkretny termin (?termin=ID) albo zapytanie - o termin
// dla grupy, prelekcję albo kolejną edycję, gdy kalendarz jest pusty.
function signupContext(req) {
  const workshop = workshops.getWorkshop(req.params.slug);
  if (!workshop) return null;
  const sessionId = parseInt(req.query.termin || req.body?.termin, 10);
  const session = Number.isFinite(sessionId) ? workshops.getSession(sessionId) : null;
  const validSession = session && session.workshop_id === workshop.id ? session : null;
  // Pełny / miniony / odwołany termin: formularz przechodzi w zapytanie (lista
  // rezerwowa), a strona wyjaśnia dlaczego.
  const openSession = validSession && validSession.canSignUp ? validSession : null;
  return {
    workshop,
    session: openSession,
    unavailableSession: validSession && !openSession ? validSession : null,
    kind: openSession ? 'session' : 'request',
    maxParticipants: openSession ? Math.max(1, Math.min(MAX_PER_SIGNUP, openSession.seatsLeft)) : MAX_PER_REQUEST,
  };
}

function renderForm(res, ctx, { values = {}, errors = {}, formError = null, status = 200 } = {}) {
  const { workshop, session } = ctx;
  res.status(status).page('workshops/signup', {
    title: `Zapis: ${workshop.title}${session ? `, ${dateNum(session.starts_at)}` : ''} | ${site.name}`,
    description: workshop.summary,
    noindex: true,
    ...ctx,
    values: { participants: 1, ...values },
    errors,
    formError,
  });
}

router.get('/warsztaty/:slug/zapis', (req, res, next) => {
  const ctx = signupContext(req);
  if (!ctx) return next();
  renderForm(res, ctx);
});

router.post('/warsztaty/:slug/zapis', limits.signup, (req, res, next) => {
  const ctx = signupContext(req);
  if (!ctx) return next();
  const body = req.body || {};
  const thanks = `/warsztaty/${ctx.workshop.slug}/zapis/dziekuje${ctx.session ? `?termin=${ctx.session.id}` : ''}`;

  // Bot wypełnił pole-pułapkę: udajemy sukces, niczego nie zapisujemy.
  if (forms.isSpam(body)) return res.redirect(303, thanks);

  const { values, errors } = forms.signup(body, ctx);
  if (Object.keys(errors).length) return renderForm(res, ctx, { values, errors, status: 422 });

  let signup;
  try {
    signup = workshops.createSignup({
      ...values,
      kind: ctx.kind,
      workshopId: ctx.workshop.id,
      sessionId: ctx.session ? ctx.session.id : null,
    });
  } catch (err) {
    if (err instanceof workshops.SignupError) {
      return renderForm(res, signupContext(req), { values, formError: err.message, status: 409 });
    }
    throw err;
  }

  notifications.signupCreated(signup).catch((err) => console.error('[warsztaty] powiadomienie:', err));
  res.redirect(303, thanks);
});

router.get('/warsztaty/:slug/zapis/dziekuje', (req, res, next) => {
  const ctx = signupContext(req);
  if (!ctx) return next();
  res.page('workshops/thanks', {
    title: `Dziękuję za zgłoszenie | ${site.name}`,
    noindex: true,
    ...ctx,
  });
});

module.exports = { router };
