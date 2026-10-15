// Formy dostawy. Ceny w groszach brutto - na razie stałe; po wyborze
// przewoźnika/integracji można je przenieść do bazy.
const METHODS = [
  {
    id: 'odbior',
    label: 'Odbiór osobisty w pracowni',
    detail: 'Sopot — termin odbioru ustalimy mailowo',
    price: 0,
    needs: null,
  },
  {
    id: 'paczkomat',
    label: 'Paczkomat InPost',
    detail: 'podaj kod paczkomatu, np. SOP01M',
    price: 1699,
    needs: 'locker',
  },
  {
    id: 'kurier',
    label: 'Kurier',
    detail: 'dostawa pod wskazany adres w Polsce',
    price: 1999,
    needs: 'address',
  },
];

function get(id) {
  return METHODS.find((m) => m.id === id) || null;
}

module.exports = { METHODS, get };
