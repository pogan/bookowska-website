// Symulowany operator płatności - zastępuje prawdziwą bramkę, dopóki pracownia
// nie wybierze operatora. Zachowuje się jak typowa bramka z przekierowaniem:
// createPayment() zwraca adres "bramki" (/platnosc/mock/:ref), a wynik płatności
// przychodzi jako zdarzenie (routes/payments.js -> payments.handleEvent), czyli
// tą samą ścieżką, którą pójdzie webhook prawdziwego operatora.
const crypto = require('crypto');

module.exports = {
  id: 'mock',
  label: 'Płatność testowa (symulacja)',
  isTest: true,

  async createPayment(order) {
    const ref = `mock_${crypto.randomBytes(12).toString('hex')}`;
    return { ref, redirectUrl: `/platnosc/mock/${ref}` };
  },
};
