// Synchronizuje produkty z db/seed/products.json do bazy.
// Użycie: npm run seed  [-- --reset-stock]
//   --reset-stock  nadpisuje stany magazynowe wartościami z pliku (domyślnie
//                  stan ustawiany jest tylko przy pierwszym imporcie produktu).
// Warsztaty i terminy NIE są synchronizowane - zarządza się nimi w panelu
// (/admin/wydarzenia); db/seed/workshops.json trafia tylko do pustej bazy.
require('../lib/config');
const { syncProducts, importWorkshops } = require('../lib/seed');

const resetStock = process.argv.includes('--reset-stock');
const stats = syncProducts({ resetStock });

console.log(
  `Produkty: ${stats.inserted} nowych, ${stats.updated} zaktualizowanych, ` +
    `${stats.hidden} ukrytych${resetStock ? ' (stany magazynowe nadpisane)' : ''}.`,
);
const imported = importWorkshops();
console.log(
  imported
    ? `Warsztaty: pusta baza - wczytano ${imported.workshops} rodzajów i ${imported.sessions} terminów z pliku.`
    : 'Warsztaty: pominięte - zarządzaj nimi w panelu /admin/wydarzenia.',
);
