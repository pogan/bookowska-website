// Panel administracyjny - na tym etapie tylko podgląd: najbliższe terminy z
// obłożeniem, zgłoszenia na warsztaty i zamówienia. Zarządzanie uczestnikami
// i ofertą dojdzie w kolejnym etapie (wraz z płatnościami za warsztaty).
const express = require('express');
const site = require('../lib/site');
const orders = require('../lib/orders');
const shipping = require('../lib/shipping');
const workshops = require('../lib/workshops');
const { isAdmin, googleConfigured } = require('../lib/auth');

const router = express.Router();

const LOGIN_MESSAGES = {
  odmowa: 'To konto Google nie ma dostępu do panelu.',
  niepotwierdzony: 'Adres e-mail tego konta Google nie jest potwierdzony.',
};

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (isAdmin(req)) return next();
  if (req.user) {
    return res.status(403).page('admin/forbidden', { title: `Brak dostępu | ${site.name}`, noindex: true });
  }
  if (req.path !== '/') return res.redirect('/admin');
  return res.page('admin/login', {
    title: `Logowanie | ${site.name}`,
    noindex: true,
    googleConfigured,
    loginError: LOGIN_MESSAGES[req.query.logowanie] || null,
  });
});

router.get('/', (req, res) => {
  orders.expireStale();
  const allOrders = orders.listRecent(200);
  res.page('admin/dashboard', {
    title: `Panel | ${site.name}`,
    noindex: true,
    sessions: workshops.upcomingSessions(),
    signups: workshops.recentSignups(200),
    orders: allOrders,
    stats: {
      newSignups: workshops.recentSignups(1000).filter((s) => s.status === 'new').length,
      paidOrders: allOrders.filter((o) => o.status === 'paid').length,
      paidTotal: allOrders.filter((o) => o.status === 'paid').reduce((sum, o) => sum + o.total, 0),
    },
    statusLabels: orders.STATUS_LABELS,
    bodyClass: 'page-admin',
  });
});

router.get('/zamowienia/:number', (req, res, next) => {
  const order = orders.getByNumber(req.params.number);
  if (!order) return next();
  res.page('admin/order', {
    title: `${order.number} | Panel | ${site.name}`,
    noindex: true,
    order,
    method: shipping.get(order.shipping_method),
    bodyClass: 'page-admin',
  });
});

module.exports = { router };
