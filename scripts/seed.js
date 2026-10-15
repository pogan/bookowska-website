// Wczytuje ofertę z db/seed/products.json i db/seed/workshops.json do bazy.
// Użycie: npm run seed  [-- --reset-stock]
//   --reset-stock  nadpisuje stany magazynowe wartościami z pliku (domyślnie
//                  stan ustawiany jest tylko przy pierwszym imporcie produktu).
require('../lib/config');
const { syncAll } = require('../lib/seed');

const resetStock = process.argv.includes('--reset-stock');
const stats = syncAll({ resetStock });

console.log(
  `Produkty: ${stats.products.inserted} nowych, ${stats.products.updated} zaktualizowanych, ` +
    `${stats.products.hidden} ukrytych${resetStock ? ' (stany magazynowe nadpisane)' : ''}.`,
);
console.log(
  `Warsztaty: ${stats.workshops.workshops}, terminy: ${stats.workshops.sessions}, ` +
    `usunięte terminy: ${stats.workshops.removedSessions}, ukryte warsztaty: ${stats.workshops.hidden}.`,
);
if (stats.workshops.keptWithSignups) {
  console.log(
    `Uwaga: ${stats.workshops.keptWithSignups} termin(y) nie ma już w pliku, ale mają zgłoszenia - zostały w bazie.`,
  );
}
