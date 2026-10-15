// Wysyłka e-maili przez SMTP (nodemailer). Bez SMTP_HOST aplikacja działa
// normalnie: wiadomość jest pomijana z wpisem w logu (w trybie deweloperskim
// z pełną treścią, żeby dało się sprawdzić przepływ bez skrzynki).
// send() nigdy nie rzuca - błąd poczty nie może zablokować zapisu zgłoszenia
// ani obsługi płatności. Zwraca true, gdy serwer SMTP przyjął wiadomość.
const nodemailer = require('nodemailer');
const config = require('./config');

const { host, port, secure, user, pass, from } = config.mail;
const configured = Boolean(host && from);

const transporter = configured
  ? nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    })
  : null;

async function send({ to, subject, text, replyTo }) {
  if (!to) {
    console.warn(`[mail] pominięto „${subject}” - brak adresata (ustaw CONTACT_EMAIL?).`);
    return false;
  }
  if (!configured) {
    if (!config.isTest) {
      console.info(`[mail] SMTP nieskonfigurowany - pominięto „${subject}” do ${to}.`);
      if (!config.isProduction) console.info(`----- treść -----\n${text}\n-----------------`);
    }
    return false;
  }
  try {
    await transporter.sendMail({ from, to, subject, text, replyTo });
    return true;
  } catch (err) {
    console.error(`[mail] nie wysłano „${subject}” do ${to}:`, err.message);
    return false;
  }
}

module.exports = { configured, send };
