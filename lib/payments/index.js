// Fasada płatności. Operator wybierany przez PAYMENT_PROVIDER w .env.
//
// Interfejs operatora (lib/payments/<id>.js):
//   id, label, isTest
//   createPayment(order) -> { ref, redirectUrl }   rejestracja transakcji u operatora
// Prawdziwy operator doda też trasę webhooka (weryfikacja podpisu!) wołającą
// handleEvent() - tak jak robi to dziś symulacja w routes/payments.js. Przy
// przekierowaniu do zewnętrznej bramki trzeba dopisać jej domenę do form-action
// w CSP (lib/security.js), bo przekierowanie następuje po wysłaniu formularza.
const config = require('../config');
const orders = require('../orders');
const notifications = require('../notifications');

const PROVIDERS = {
  mock: require('./mock'),
};

function provider() {
  const p = PROVIDERS[config.payments.provider];
  if (!p) throw new Error(`Nieznany operator płatności: ${config.payments.provider}`);
  return p;
}

async function startPayment(order) {
  const { ref, redirectUrl } = await provider().createPayment(order);
  orders.setPaymentRef(order.id, ref);
  return redirectUrl;
}

// event: { provider, eventId, ref, status: 'paid'|'failed'|'cancelled', payload }
function handleEvent(event) {
  const result = orders.applyPaymentEvent(event);
  if (result.changed && result.order && result.order.status === 'paid') {
    notifications
      .orderPaid(result.order, { testMode: Boolean(PROVIDERS[event.provider] && PROVIDERS[event.provider].isTest) })
      .catch((err) => console.error('[payments] powiadomienie o zamówieniu:', err));
  }
  return result;
}

module.exports = {
  provider,
  startPayment,
  handleEvent,
  isTestMode: () => Boolean(provider().isTest),
};
