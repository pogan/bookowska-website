// Walidacja formularzy. Każda funkcja zwraca { values, errors } - values to
// oczyszczone dane do ponownego wypełnienia formularza, errors to mapa
// pole -> komunikat (pusta = poprawne).
const shipping = require('./shipping');

const clean = (v, max = 500) =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[\d\s()-]{9,20}$/;
const POSTCODE_RE = /^\d{2}-\d{3}$/;
// Kody paczkomatów InPost: np. SOP01M, GDA123A, KRA01N, POZ08BAPP.
const LOCKER_RE = /^[A-Z]{3}\d{1,4}[A-Z]{0,4}$/;

function contactFields(body, errors, { phoneRequired = false } = {}) {
  const name = oneLine(body.name, 100);
  const email = oneLine(body.email, 200).toLowerCase();
  const phone = oneLine(body.phone, 30);
  if (name.length < 2) errors.name = 'Podaj imię i nazwisko.';
  if (!EMAIL_RE.test(email)) errors.email = 'Podaj poprawny adres e-mail.';
  if (phone && !PHONE_RE.test(phone)) errors.phone = 'Podaj poprawny numer telefonu.';
  if (!phone && phoneRequired) errors.phone = 'Podaj numer telefonu — przewoźnik wyśle na niego powiadomienie.';
  return { name, email, phone };
}

// Pole-pułapka: niewidoczne dla ludzi (CSS + aria-hidden), boty je wypełniają.
function isSpam(body) {
  return Boolean(clean(body.website, 200));
}

function signup(body, { kind, maxParticipants }) {
  const errors = {};
  const values = contactFields(body, errors);
  const participants = parseInt(body.participants, 10);
  values.participants = Number.isFinite(participants) ? participants : 1;
  values.message = clean(body.message, 2000);
  if (!(values.participants >= 1 && values.participants <= maxParticipants)) {
    errors.participants = `Liczba osób: od 1 do ${maxParticipants}.`;
  }
  if (kind === 'request' && values.message.length < 10) {
    errors.message = 'Napisz kilka słów: ile osób, jaki termin i miejsce.';
  }
  return { values, errors };
}

function checkout(body) {
  const errors = {};
  const method = shipping.get(oneLine(body.shipping, 20));
  const values = contactFields(body, errors, { phoneRequired: Boolean(method && method.needs) });
  values.shipping = method ? method.id : '';
  values.locker = oneLine(body.locker, 20).toUpperCase().replace(/\s+/g, '');
  values.street = oneLine(body.street, 150);
  values.postcode = oneLine(body.postcode, 10);
  values.city = oneLine(body.city, 80);
  values.notes = clean(body.notes, 1000);
  values.terms = body.terms === 'on' || body.terms === '1';

  if (!method) errors.shipping = 'Wybierz formę dostawy.';
  if (method && method.needs === 'locker' && !LOCKER_RE.test(values.locker)) {
    errors.locker = 'Podaj kod paczkomatu, np. SOP01M (znajdziesz go na mapie InPost).';
  }
  if (method && method.needs === 'address') {
    if (values.street.length < 3) errors.street = 'Podaj ulicę i numer.';
    if (!POSTCODE_RE.test(values.postcode)) errors.postcode = 'Kod pocztowy w formacie 00-000.';
    if (values.city.length < 2) errors.city = 'Podaj miejscowość.';
  }
  if (!values.terms) errors.terms = 'Zaakceptuj regulamin, aby złożyć zamówienie.';
  return { values, errors, method };
}

module.exports = { signup, checkout, isSpam };
