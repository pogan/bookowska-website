// Treść i wysyłka powiadomień e-mail: zgłoszenia na warsztaty (do pracowni i do
// uczestnika) oraz opłacone zamówienia (do klienta i do pracowni). Wiadomości
// to zwykły tekst - czytelny w każdym programie pocztowym i bez ryzyka
// wstrzyknięcia HTML z danych formularza.
const config = require('./config');
const site = require('./site');
const mailer = require('./mailer');
const orders = require('./orders');
const shipping = require('./shipping');
const workshops = require('./workshops');
const { money, dateLong, time, plural } = require('./format');

const studioEmail = () => config.contact.email;

function sessionLine(session) {
  return `${dateLong(session.starts_at)}, ${time(session.starts_at)}–${time(session.ends_at)}`;
}

function firstName(name) {
  return String(name).trim().split(/\s+/)[0];
}

function signupStudioMail(signup, workshop, session) {
  const lines = [
    signup.kind === 'session' ? 'Nowe zgłoszenie na warsztaty ze strony.' : 'Nowe zapytanie o warsztaty ze strony.',
    '',
    `Warsztaty: ${workshop.title}`,
  ];
  if (session) {
    lines.push(`Termin: ${sessionLine(session)}`);
    lines.push(`Miejsce: ${session.location}`);
    lines.push(`Wolne miejsca po tym zgłoszeniu: ${session.seatsLeft} z ${session.seats}`);
  }
  lines.push(
    `Liczba osób: ${signup.participants}`,
    '',
    `Imię i nazwisko: ${signup.name}`,
    `E-mail: ${signup.email}`,
    `Telefon: ${signup.phone || '—'}`,
    '',
    'Wiadomość:',
    signup.message || '—',
    '',
    `Odpowiedz na tę wiadomość, aby napisać bezpośrednio do zgłaszającej osoby.`,
    `Zgłoszenie nr ${signup.id} jest zapisane w panelu: ${config.baseUrl}/admin`,
  );
  const subject =
    signup.kind === 'session'
      ? `Zgłoszenie: ${workshop.title}, ${session ? session.starts_at.slice(0, 10) : ''} (${signup.participants} os.)`
      : `Zapytanie: ${workshop.title} — ${signup.name}`;
  return { subject, text: lines.join('\n') };
}

function signupParticipantMail(signup, workshop, session) {
  const lines = [`Cześć ${firstName(signup.name)}!`, ''];
  if (session) {
    lines.push(
      `Dziękuję za zgłoszenie na warsztaty „${workshop.title}”.`,
      '',
      `Termin: ${sessionLine(session)}`,
      `Miejsce: ${session.location}`,
      `Liczba osób: ${signup.participants}`,
    );
    if (session.price) lines.push(`Cena: ${money(session.price)} od osoby`);
    lines.push(
      '',
      'Miejsce jest wstępnie zarezerwowane. W ciągu dwóch dni roboczych odpiszę z potwierdzeniem',
      'i danymi do płatności — rezerwacja staje się ostateczna po wpłacie.',
    );
  } else {
    lines.push(
      `Dziękuję za wiadomość w sprawie: „${workshop.title}”.`,
      '',
      'Odezwę się w ciągu dwóch dni roboczych z propozycją terminu i wyceną.',
    );
  }
  lines.push(
    '',
    'Jeśli masz pytania, po prostu odpowiedz na tego maila.',
    '',
    `${site.ownerShort} — ${site.name}`,
    config.baseUrl,
  );
  return {
    subject: session ? `Dziękuję za zgłoszenie — ${workshop.title}` : `Dziękuję za wiadomość — ${workshop.title}`,
    text: lines.join('\n'),
  };
}

async function signupCreated(signup) {
  const session = signup.session_id ? workshops.getSession(signup.session_id) : null;
  const workshop = workshops.getWorkshopById(signup.workshop_id);
  if (!workshop) return;

  const toStudio = signupStudioMail(signup, workshop, session);
  if (await mailer.send({ to: studioEmail(), replyTo: signup.email, ...toStudio })) {
    workshops.markSignupEmail(signup.id, 'studio_notified_at');
  }
  const toParticipant = signupParticipantMail(signup, workshop, session);
  if (await mailer.send({ to: signup.email, replyTo: studioEmail() || undefined, ...toParticipant })) {
    workshops.markSignupEmail(signup.id, 'confirmation_sent_at');
  }
}

function orderLines(order) {
  const method = shipping.get(order.shipping_method);
  const lines = order.items.map((i) => `  ${i.quantity} × ${i.name} — ${money(i.unit_price * i.quantity)}`);
  lines.push(`  Dostawa: ${method ? method.label : order.shipping_method} — ${money(order.shipping_cost)}`);
  lines.push(`  Razem: ${money(order.total)}`);
  return lines;
}

function deliveryLines(order) {
  if (order.parcel_locker) return [`Paczkomat: ${order.parcel_locker}`];
  if (order.address) return [`Adres: ${order.address.street}, ${order.address.postcode} ${order.address.city}`];
  return ['Odbiór osobisty w pracowni w Sopocie — termin ustalimy mailowo.'];
}

function orderCustomerMail(order, { testMode }) {
  const seller = config.seller;
  const lines = [
    `Dziękuję za zamówienie ${order.number}!`,
    '',
  ];
  if (testMode) {
    lines.push('UWAGA: sklep działa w trybie testowym — płatność została zasymulowana', 'i to zamówienie nie zostanie zrealizowane.', '');
  }
  lines.push(
    'Zamówione produkty:',
    ...orderLines(order),
    '',
    ...deliveryLines(order),
    '',
    'Wyślę zamówienie w ciągu 5 dni roboczych i dam znać mailem, gdy paczka wyruszy.',
    `Status zamówienia: ${config.baseUrl}/zamowienie/${order.token}`,
    '',
    `${site.ownerShort} — ${site.name}`,
    '',
    '—',
    `Sprzedawca: ${[seller.name, seller.address, seller.nip && `NIP ${seller.nip}`].filter(Boolean).join(', ') || site.legalBrand}`,
    `Regulamin sklepu: ${config.baseUrl}/regulamin`,
  );
  return { subject: `Zamówienie ${order.number} — potwierdzenie`, text: lines.join('\n') };
}

function orderStudioMail(order, { testMode }) {
  const lines = [
    `${testMode ? '[TEST] ' : ''}Nowe opłacone zamówienie ${order.number}.`,
    '',
    ...orderLines(order),
    '',
    `Klient: ${order.customer_name}`,
    `E-mail: ${order.email}`,
    `Telefon: ${order.phone || '—'}`,
    ...deliveryLines(order),
    '',
    `Uwagi: ${order.notes || '—'}`,
  ];
  if (order.stock_conflict) {
    lines.push('', 'UWAGA: płatność dotarła po wygaśnięciu rezerwacji i części towaru zabrakło — skontaktuj się z klientem.');
  }
  lines.push('', `Szczegóły: ${config.baseUrl}/admin/zamowienia/${order.number}`);
  return {
    subject: `${testMode ? '[TEST] ' : ''}Zamówienie ${order.number} — ${money(order.total)} (${order.items.reduce((s, i) => s + i.quantity, 0)} ${plural(order.items.reduce((s, i) => s + i.quantity, 0), 'produkt', 'produkty', 'produktów')})`,
    text: lines.join('\n'),
  };
}

async function orderPaid(orderRow, { testMode = false } = {}) {
  const order = orders.getByToken(orderRow.token);
  if (!order || order.status !== 'paid') return;
  // Claim przed wysyłką: przy zdublowanym powiadomieniu od operatora tylko jedno
  // wywołanie wyśle e-mail. Nieudana wysyłka zwalnia claim.
  if (orders.claimEmail(order.id, 'customer_email_sent_at')) {
    const ok = await mailer.send({ to: order.email, replyTo: studioEmail() || undefined, ...orderCustomerMail(order, { testMode }) });
    if (!ok) orders.releaseEmailClaim(order.id, 'customer_email_sent_at');
  }
  if (orders.claimEmail(order.id, 'studio_email_sent_at')) {
    const ok = await mailer.send({ to: studioEmail(), replyTo: order.email, ...orderStudioMail(order, { testMode }) });
    if (!ok) orders.releaseEmailClaim(order.id, 'studio_email_sent_at');
  }
}

module.exports = { signupCreated, orderPaid };
