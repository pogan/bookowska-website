// Formatowanie kwot, dat i liczebników. Kwoty w całej aplikacji to liczby
// całkowite w groszach; daty w bazie to UTC (ISO 8601), a na stronie zawsze
// czas warszawski - niezależnie od strefy serwera.
const TZ = 'Europe/Warsaw';

function money(grosze) {
  const value = Number(grosze) / 100;
  const whole = Number(grosze) % 100 === 0;
  return (
    value.toLocaleString('pl-PL', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }) + ' zł'
  );
}

// "129,00" -> 12900; akceptuje przecinek i kropkę. Zwraca null dla błędnych danych.
function parseMoney(text) {
  const m = String(text).trim().replace(',', '.').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] || '0').padEnd(2, '0'));
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

const partsFormatter = new Intl.DateTimeFormat('pl-PL', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const longDateFormatter = new Intl.DateTimeFormat('pl-PL', {
  timeZone: TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat('pl-PL', { timeZone: TZ, month: 'long', year: 'numeric' });

function parts(iso) {
  const out = {};
  for (const p of partsFormatter.formatToParts(new Date(iso))) out[p.type] = p.value;
  return out;
}

// "07.11.2026"
function dateNum(iso) {
  const p = parts(iso);
  return `${p.day}.${p.month}.${p.year}`;
}

// "10:00"
function time(iso) {
  const p = parts(iso);
  return `${p.hour}:${p.minute}`;
}

// "sob."
function weekdayShort(iso) {
  return parts(iso).weekday;
}

// "sobota, 7 listopada 2026"
function dateLong(iso) {
  return longDateFormatter.format(new Date(iso));
}

// "listopad 2026"
function monthLabel(iso) {
  return monthFormatter.format(new Date(iso));
}

// "07.11.2026, 10:00" - znacznik czasu w panelu (dla dat z SQLite "YYYY-MM-DD HH:MM:SS" w UTC).
function dateTime(sqliteOrIso) {
  if (!sqliteOrIso) return '';
  const iso = /T/.test(sqliteOrIso) ? sqliteOrIso : `${sqliteOrIso.replace(' ', 'T')}Z`;
  return `${dateNum(iso)}, ${time(iso)}`;
}

// Przesunięcie strefy warszawskiej w minutach dla danej chwili (+60 zimą, +120 latem).
function warsawOffsetMinutes(date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName').value;
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!m) return 0;
  return (m[1] === '+' ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3]));
}

// "2026-11-07 10:00" (czas warszawski) -> "2026-11-07T09:00:00.000Z".
// Dwie iteracje wystarczają, żeby trafić we właściwe przesunięcie także w dniu
// zmiany czasu.
function warsawToUtc(local) {
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Nieprawidłowa data lokalna: "${local}" (oczekiwano YYYY-MM-DD HH:MM)`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let utc = naive;
  for (let i = 0; i < 2; i++) utc = naive - warsawOffsetMinutes(new Date(utc)) * 60000;
  return new Date(utc).toISOString();
}

// UTC ISO -> "2026-11-07T10:00:00+01:00" (schema.org Event wymaga strefy).
function isoWithOffset(iso) {
  const date = new Date(iso);
  const off = warsawOffsetMinutes(date);
  const local = new Date(date.getTime() + off * 60000).toISOString().slice(0, 19);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${local}${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// 240 -> "4 godz.", 210 -> "3,5 godz.", 90 -> "1,5 godz.", 45 -> "45 min"
function duration(minutes) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours.toLocaleString('pl-PL', { maximumFractionDigits: 1 })} godz.`;
}

// Polska typografia: jednoliterowe spójniki i przyimki ("w", "z", "i", "a"...)
// nie mogą zostać na końcu wiersza - wiążemy je twardą spacją z kolejnym słowem.
// Lookbehind nie konsumuje poprzedzającego znaku, więc ciągi typu "i w domu"
// obsługuje jedno przejście.
function typo(text) {
  return String(text ?? '').replace(/(?<=^|[\s(„])([aiouwzAIOUWZ])[ \t\r\n]+/g, '$1\u00a0');
}

// Akapity z tekstu (pusta linia = nowy akapit) - do opisów z seedów.
function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

module.exports = {
  TZ,
  money,
  parseMoney,
  plural,
  dateNum,
  time,
  weekdayShort,
  dateLong,
  monthLabel,
  dateTime,
  warsawToUtc,
  isoWithOffset,
  duration,
  paragraphs,
  typo,
};
