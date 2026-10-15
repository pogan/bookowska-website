// Symulowana bramka płatności (PAYMENT_PROVIDER=mock). Udaje stronę operatora:
// klient wybiera wynik płatności, a my zamieniamy go na zdarzenie i przepuszczamy
// przez payments.handleEvent() - dokładnie tę ścieżkę, którą pójdzie webhook
// prawdziwego operatora. Trasy działają tylko w trybie mock i tylko dla
// zamówień złożonych w tym trybie - po przełączeniu na prawdziwego operatora
// nikt nie "opłaci" zamówienia kliknięciem.
const crypto = require('crypto');
const express = require('express');
const config = require('../lib/config');
const site = require('../lib/site');
const orders = require('../lib/orders');
const payments = require('../lib/payments');

const router = express.Router();

const RESULTS = { paid: 'paid', failed: 'failed', cancelled: 'cancelled' };

function mockOrder(req) {
  if (config.payments.provider !== 'mock') return null;
  const order = orders.getByRef(req.params.ref);
  return order && order.payment_provider === 'mock' ? order : null;
}

router.get('/platnosc/mock/:ref', (req, res, next) => {
  orders.expireStale();
  const order = mockOrder(req);
  if (!order) return next();
  if (order.status !== 'pending') return res.redirect(303, `/zamowienie/${order.token}`);
  res.page('payments/mock', {
    title: `Płatność (symulacja) | ${site.name}`,
    noindex: true,
    order,
    showTestBanner: true,
    bodyClass: 'page-gateway',
  });
});

router.post('/platnosc/mock/:ref', (req, res, next) => {
  const order = mockOrder(req);
  if (!order) return next();
  const status = RESULTS[(req.body || {}).result];
  if (!status) return res.status(400).type('text/plain').send('Nieznany wynik płatności.');
  payments.handleEvent({
    provider: 'mock',
    eventId: `mock_evt_${crypto.randomBytes(8).toString('hex')}`,
    ref: order.payment_ref,
    status,
    payload: { simulated: true, at: new Date().toISOString() },
  });
  res.redirect(303, `/zamowienie/${order.token}`);
});

module.exports = { router };
