// Walidacja formularzy. Każda funkcja zwraca { values, errors } - values to
// oczyszczone dane do ponownego wypełnienia formularza, errors to mapa
// pole -> komunikat (pusta = poprawne).
const shipping = require('./shipping');
const { parseMoney, warsawToUtc } = require('./format');
const { slugify, SLUG_RE } = require('./slug');

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

// --- Panel: rodzaje warsztatów i terminy -------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SESSION_STATUSES = ['open', 'closed', 'cancelled'];

// Date.parse("2030-02-30T00:00Z") w V8 nie zwraca błędu, tylko przesuwa datę na
// 2 marca - dlatego porównujemy składowe.
function isRealDate(text) {
  if (!DATE_RE.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Puste pole = null; inaczej liczba całkowita z zakresu albo błąd.
function optionalInt(raw, min, max) {
  const text = oneLine(raw, 10);
  if (text === '') return { value: null, ok: true };
  const n = Number(text);
  return { value: n, ok: Number.isInteger(n) && n >= min && n <= max };
}

function optionalMoney(raw) {
  const text = oneLine(raw, 12).replace(/\s*zł$/i, '');
  if (text === '') return { value: null, ok: true };
  const value = parseMoney(text);
  return { value, ok: value !== null };
}

// values - do ponownego wypełnienia formularza (tekst), data - do zapisu.
function workshopForm(body, { imageKeys }) {
  const errors = {};
  const values = {
    title: oneLine(body.title, 120),
    slug: oneLine(body.slug, 80).toLowerCase(),
    kind: body.kind === 'request' ? 'request' : 'open',
    summary: clean(body.summary, 300).replace(/\s+/g, ' '),
    description: clean(body.description, 5000),
    program: clean(body.program, 3000),
    duration: oneLine(body.duration, 10),
    price: oneLine(body.price, 12),
    capacity: oneLine(body.capacity, 10),
    level: oneLine(body.level, 100),
    includes: oneLine(body.includes, 200),
    takeaway: oneLine(body.takeaway, 200),
    image: oneLine(body.image, 60),
    sort: oneLine(body.sort, 10),
    is_active: body.is_active === 'on' || body.is_active === '1',
  };

  if (values.title.length < 3) errors.title = 'Podaj nazwę (min. 3 znaki).';
  const slug = values.slug || slugify(values.title);
  if (!SLUG_RE.test(slug)) errors.slug = 'Adres: małe litery bez polskich znaków, cyfry i myślniki, np. oprawa-japonska.';
  if (values.summary.length < 10) errors.summary = 'Napisz krótki opis (min. 10 znaków) — pojawia się na liście warsztatów.';
  // Jeden punkt w linii; zdejmujemy tylko znaczniki listy ("- ", "• ", "1. ", "2) ").
  const program = values.program.split('\n').map((l) => l.trim().replace(/^(?:[-–•*]|\d+[.)])\s+/, '')).filter(Boolean);
  if (program.length > 20) errors.program = 'Program: najwyżej 20 punktów.';
  const duration = optionalInt(values.duration, 15, 1440);
  if (!duration.ok) errors.duration = 'Czas w minutach (15–1440), np. 240 = 4 godz.';
  const price = optionalMoney(values.price);
  if (!price.ok) errors.price = 'Cena w złotych, np. 220 albo 199,99.';
  const capacity = optionalInt(values.capacity, 1, 500);
  if (!capacity.ok || capacity.value === null) errors.capacity = 'Podaj limit miejsc (1–500).';
  if (values.image && !imageKeys.includes(values.image)) errors.image = 'Wybierz zdjęcie z biblioteki.';
  const sort = optionalInt(values.sort, -9999, 9999);
  if (!sort.ok) errors.sort = 'Kolejność to liczba całkowita.';

  const data = {
    slug,
    title: values.title,
    kind: values.kind,
    summary: values.summary,
    description: values.description,
    program: JSON.stringify(program),
    duration_minutes: duration.value,
    price: price.value,
    capacity: capacity.value,
    level: values.level || null,
    includes: values.includes || null,
    takeaway: values.takeaway || null,
    image: values.image || null,
    is_active: values.is_active ? 1 : 0,
    sort: sort.value ?? 0,
  };
  return { values, errors, data };
}

function sessionForm(body, { workshopIds }) {
  const errors = {};
  const values = {
    workshop_id: oneLine(body.workshop_id, 10),
    date: oneLine(body.date, 10),
    start: oneLine(body.start, 5),
    end: oneLine(body.end, 5),
    location: oneLine(body.location, 200),
    capacity: oneLine(body.capacity, 10),
    price: oneLine(body.price, 12),
    note: oneLine(body.note, 200),
    status: SESSION_STATUSES.includes(body.status) ? body.status : 'open',
  };

  const workshopId = Number(values.workshop_id);
  if (!workshopIds.includes(workshopId)) errors.workshop_id = 'Wybierz rodzaj warsztatów.';
  if (!isRealDate(values.date)) errors.date = 'Podaj poprawną datę.';
  if (!TIME_RE.test(values.start)) errors.start = 'Godzina w formacie GG:MM.';
  if (!TIME_RE.test(values.end)) errors.end = 'Godzina w formacie GG:MM.';
  else if (TIME_RE.test(values.start) && values.end <= values.start) errors.end = 'Koniec musi być po rozpoczęciu.';
  if (values.location.length < 2) errors.location = 'Podaj miejsce.';
  const capacity = optionalInt(values.capacity, 1, 500);
  if (!capacity.ok) errors.capacity = 'Liczba miejsc 1–500 albo puste (= jak w warsztatach).';
  const price = optionalMoney(values.price);
  if (!price.ok) errors.price = 'Cena w złotych albo puste (= jak w warsztatach).';

  let data = null;
  if (!Object.keys(errors).length) {
    data = {
      workshop_id: workshopId,
      starts_at: warsawToUtc(`${values.date} ${values.start}`),
      ends_at: warsawToUtc(`${values.date} ${values.end}`),
      location: values.location,
      capacity: capacity.value,
      price: price.value,
      status: values.status,
      note: values.note || null,
    };
  }
  return { values, errors, data };
}

module.exports = { signup, checkout, isSpam, workshopForm, sessionForm };
