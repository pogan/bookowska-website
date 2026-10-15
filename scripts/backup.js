// Kopia zapasowa bazy SQLite przez API backupu (spójna także przy trybie WAL i
// działającym serwerze). Od kiedy wydarzenia powstają w panelu, baza nie jest
// odtwarzalna z repozytorium - na serwerze uruchamiaj ją z crona, np.:
//   15 3 * * * cd /home/ubuntu/websites/bookowska-website && node scripts/backup.js >> logs/backup.log 2>&1
// Użycie: npm run backup   (BACKUP_DIR - katalog, domyślnie data/backups;
//                           BACKUP_KEEP - ile ostatnich kopii trzymać, domyślnie 30)
require('../lib/config');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const dir = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, '..', 'data', 'backups'));
const keep = Math.max(1, parseInt(process.env.BACKUP_KEEP || '30', 10));
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const file = path.join(dir, `bookowska-${stamp}.sqlite`);

fs.mkdirSync(dir, { recursive: true });
db.backup(file)
  .then(() => {
    const all = fs.readdirSync(dir).filter((f) => /^bookowska-[\d-]+\.sqlite$/.test(f)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.rmSync(path.join(dir, old));
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`${new Date().toISOString()} kopia ${path.basename(file)} (${kb} kB), w katalogu: ${Math.min(all.length, keep)}`);
  })
  .catch((err) => {
    console.error('Kopia zapasowa nie powiodła się:', err.message);
    process.exitCode = 1;
  });
