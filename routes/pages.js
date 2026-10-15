const express = require('express');
const config = require('../lib/config');
const site = require('../lib/site');
const seo = require('../lib/seo');
const catalog = require('../lib/catalog');
const workshops = require('../lib/workshops');
const orders = require('../lib/orders');
const shipping = require('../lib/shipping');
const { APP_VERSION } = require('../lib/version');
const { money, dateNum, time } = require('../lib/format');

const router = express.Router();

router.get('/', (req, res) => {
  res.page('pages/home', {
    title: `${site.name} — pracownia introligatorska w Sopocie`,
    description: site.description,
    canonicalPath: '/',
    jsonLd: [seo.businessSchema(), seo.websiteSchema()],
    sessions: workshops.upcomingSessions({ limit: 4 }),
    products: catalog.listActive().slice(0, 3),
    bodyClass: 'page-home',
  });
});

router.get('/o-mnie', (req, res) => {
  res.page('pages/about', {
    title: `O mnie — ${site.owner}, introligatorka | ${site.name}`,
    description:
      'Karina Lewandowska (Bookowska) — introligatorka z Sopotu. Introligatorstwem zajmuje się zawodowo od 2016 roku: oprawy, książki artystyczne, warsztaty i prelekcje.',
    canonicalPath: '/o-mnie',
    ogImageKey: 'karina-portret',
    jsonLd: [seo.breadcrumbs([{ name: 'Start', path: '/' }, { name: 'O mnie', path: '/o-mnie' }])],
  });
});

router.get('/kontakt', (req, res) => {
  res.page('pages/contact', {
    title: `Kontakt | ${site.name}`,
    description: 'Kontakt z pracownią introligatorską Bookowska w Sopocie: e-mail, Instagram, Facebook. Warsztaty, zamówienia indywidualne, współpraca.',
    canonicalPath: '/kontakt',
    jsonLd: [seo.businessSchema()],
  });
});

router.get('/regulamin', (req, res) => {
  res.page('legal/terms', {
    title: `Regulamin sklepu | ${site.name}`,
    description: 'Regulamin sklepu internetowego pracowni introligatorskiej Bookowska.',
    canonicalPath: '/regulamin',
    jsonLd: [seo.breadcrumbs([{ name: 'Start', path: '/' }, { name: 'Regulamin sklepu', path: '/regulamin' }])],
    shippingMethods: shipping.METHODS,
    pendingMinutes: orders.PENDING_TTL_MINUTES,
  });
});

router.get('/polityka-prywatnosci', (req, res) => {
  res.page('legal/privacy', {
    title: `Polityka prywatności | ${site.name}`,
    description: 'Jak pracownia Bookowska przetwarza dane osobowe: zgłoszenia na warsztaty, zamówienia, pliki cookies.',
    canonicalPath: '/polityka-prywatnosci',
    jsonLd: [seo.breadcrumbs([{ name: 'Start', path: '/' }, { name: 'Polityka prywatności', path: '/polityka-prywatnosci' }])],
  });
});

router.get('/healthz', (req, res) => {
  res.json({ status: 'ok', version: APP_VERSION.version, commit: APP_VERSION.commit });
});

router.get('/robots.txt', (req, res) => {
  const lines = config.allowIndexing
    ? [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin',
        'Disallow: /auth',
        'Disallow: /koszyk',
        'Disallow: /zamowienie',
        'Disallow: /platnosc',
        '',
        `Sitemap: ${seo.abs('/sitemap.xml')}`,
      ]
    : ['# Indeksowanie wyłączone (ALLOW_INDEXING != true).', 'User-agent: *', 'Disallow: /'];
  res.type('text/plain').send(lines.join('\n') + '\n');
});

function publicPaths() {
  return [
    '/',
    '/o-mnie',
    '/warsztaty',
    ...workshops.listWorkshops().map((w) => `/warsztaty/${w.slug}`),
    '/sklep',
    ...catalog.listActive().map((p) => `/sklep/${p.slug}`),
    '/kontakt',
    '/regulamin',
    '/polityka-prywatnosci',
  ];
}

router.get('/sitemap.xml', (req, res) => {
  const urls = publicPaths()
    .map((p) => `  <url><loc>${seo.abs(p)}</loc></url>`)
    .join('\n');
  res
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

// Zwięzły opis serwisu dla asystentów AI (konwencja llms.txt).
router.get('/llms.txt', (req, res) => {
  const lines = [
    `# ${site.name}`,
    '',
    `> ${site.description}`,
    '',
    `Prowadzi: ${site.owner} („${site.ownerShort}”), introligatorka, zawodowo od ${site.since} roku. Pracownia w Sopocie.`,
    '',
    '## Strony',
    `- [O mnie](${seo.abs('/o-mnie')}): biografia i realizacje (książki dyplomowe, 2018)`,
    `- [Warsztaty](${seo.abs('/warsztaty')}): warsztaty introligatorskie w małych grupach, zapisy przez formularz`,
    `- [Sklep](${seo.abs('/sklep')}): ręcznie szyte notesy i bony podarunkowe`,
    `- [Kontakt](${seo.abs('/kontakt')})`,
    '',
    '## Warsztaty',
    ...workshops.listWorkshops().map((w) => {
      const next = w.sessions.map((s) => `${dateNum(s.starts_at)} ${time(s.starts_at)}`).join(', ');
      return `- [${w.title}](${seo.abs(`/warsztaty/${w.slug}`)}): ${w.summary}${w.price ? ` Cena: ${money(w.price)} od osoby.` : ''}${next ? ` Terminy: ${next}.` : ''}`;
    }),
    '',
    '## Sklep',
    ...catalog.listActive().map((p) => `- [${p.name}](${seo.abs(`/sklep/${p.slug}`)}): ${money(p.price)}${p.available ? '' : ' (wyprzedane)'}`),
    '',
    '## Kontakt',
    ...(config.contact.email ? [`- E-mail: ${config.contact.email}`] : []),
    ...site.social.map((s) => `- ${s.label}: ${s.url}`),
  ];
  res.type('text/plain').send(lines.join('\n') + '\n');
});

module.exports = { router };
