const express = require('express');
const site = require('../lib/site');
const seo = require('../lib/seo');
const cart = require('../lib/cart');
const forms = require('../lib/forms');
const orders = require('../lib/orders');
const catalog = require('../lib/catalog');
const shipping = require('../lib/shipping');
const payments = require('../lib/payments');
const mailer = require('../lib/mailer');
const { limits } = require('../lib/security');
const { productDrawing } = require('../lib/drawing');

const router = express.Router();

const crumbs = (...extra) => seo.breadcrumbs([{ name: 'Start', path: '/' }, { name: 'Sklep', path: '/sklep' }, ...extra]);

// Komunikat do pokazania po przekierowaniu (POST -> redirect -> GET).
function flash(req, type, text) {
  req.session.flash = { type, text };
}

router.get('/sklep', (req, res) => {
  orders.expireStale();
  res.page('shop/index', {
    title: `Sklep — ręcznie szyte notesy | ${site.name}`,
    description: 'Ręcznie szyte notesy w oprawie półpłóciennej z papierem marmurkowym i bony podarunkowe na warsztaty introligatorskie. Pracownia Bookowska, Sopot.',
    canonicalPath: '/sklep',
    ogImageKey: 'notesy-marmurkowe',
    products: catalog.listActive(),
    shippingMethods: shipping.METHODS,
    showTestBanner: true,
    jsonLd: [crumbs()],
  });
});

router.get('/sklep/:slug', (req, res, next) => {
  orders.expireStale();
  const product = catalog.getBySlug(req.params.slug);
  if (!product) return next();
  res.page('shop/product', {
    title: `${product.name} | ${site.name}`,
    description: product.summary,
    canonicalPath: `/sklep/${product.slug}`,
    ogImageKey: product.images[0],
    ogType: 'product',
    product,
    drawing: productDrawing(product),
    inCart: (req.session.cart || {})[product.id] || 0,
    showTestBanner: true,
    jsonLd: [crumbs({ name: product.name, path: `/sklep/${product.slug}` }), seo.productSchema(product)],
  });
});

router.get('/koszyk', (req, res) => {
  orders.expireStale();
  const summary = cart.summarize(req.session);
  res.page('shop/cart', {
    title: `Koszyk | ${site.name}`,
    noindex: true,
    summary,
    showTestBanner: true,
  });
});

router.post('/koszyk/dodaj', limits.cart, (req, res) => {
  const product = catalog.getById(parseInt((req.body || {}).product, 10));
  const error = cart.add(req.session, product, (req.body || {}).quantity);
  if (error) flash(req, 'warning', error);
  else flash(req, 'success', `Dodano do koszyka: ${product.name}.`);
  res.redirect(303, '/koszyk');
});

router.post('/koszyk/zmien', limits.cart, (req, res) => {
  const body = req.body || {};
  cart.setQuantity(req.session, parseInt(body.product, 10), body.quantity);
  res.redirect(303, '/koszyk');
});

router.post('/koszyk/usun', limits.cart, (req, res) => {
  cart.remove(req.session, parseInt((req.body || {}).product, 10));
  res.redirect(303, '/koszyk');
});

function renderCheckout(res, req, { values = {}, errors = {}, formError = null, status = 200 } = {}) {
  const summary = cart.summarize(req.session);
  res.status(status).page('shop/checkout', {
    title: `Zamówienie | ${site.name}`,
    noindex: true,
    summary,
    methods: shipping.METHODS,
    values: { shipping: 'paczkomat', ...values },
    errors,
    formError,
    showTestBanner: true,
  });
}

router.get('/zamowienie', (req, res) => {
  if (cart.count(req.session) === 0) return res.redirect(303, '/koszyk');
  renderCheckout(res, req);
});

router.post('/zamowienie', limits.checkout, async (req, res) => {
  const summary = cart.summarize(req.session);
  if (!summary.lines.length) return res.redirect(303, '/koszyk');

  const { values, errors, method } = forms.checkout(req.body || {});
  if (Object.keys(errors).length) return renderCheckout(res, req, { values, errors, status: 422 });

  let order;
  try {
    order = orders.createOrder({
      lines: summary.lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      customer: { name: values.name, email: values.email, phone: values.phone },
      shipping: {
        method: method.id,
        cost: method.price,
        address: method.needs === 'address' ? { street: values.street, postcode: values.postcode, city: values.city } : null,
        locker: method.needs === 'locker' ? values.locker : null,
      },
      notes: values.notes,
      provider: payments.provider().id,
    });
  } catch (err) {
    if (err instanceof orders.OrderError) return renderCheckout(res, req, { values, formError: err.message, status: 409 });
    throw err;
  }

  // Koszyk czyścimy dopiero po potwierdzeniu płatności (strona statusu) - po
  // odrzuconej płatności klient może spróbować ponownie bez kompletowania od nowa.
  req.session.pendingOrder = order.token;
  const redirectUrl = await payments.startPayment(order);
  res.redirect(303, redirectUrl);
});

router.get('/zamowienie/:token', (req, res, next) => {
  const order = orders.getByToken(req.params.token);
  if (!order) return next();
  if (order.status === 'paid' && req.session.pendingOrder === order.token) {
    cart.clear(req.session);
    delete req.session.pendingOrder;
  }
  res.page('shop/order', {
    title: `Zamówienie ${order.number} | ${site.name}`,
    noindex: true,
    order,
    method: shipping.get(order.shipping_method),
    mailerConfigured: mailer.configured,
    paymentUrl: order.status === 'pending' && order.payment_provider === 'mock' && order.payment_ref
      ? `/platnosc/mock/${order.payment_ref}`
      : null,
    showTestBanner: order.payment_provider === 'mock',
  });
});

module.exports = { router };
