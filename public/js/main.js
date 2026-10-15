// Progressive enhancement: wszystkie formularze działają bez JavaScriptu
// (serwer waliduje i przelicza wszystko sam), skrypt tylko upraszcza obsługę.
// Zgodnie z CSP: żadnych skryptów inline ani atrybutów on*.
(() => {
  document.documentElement.classList.replace('no-js', 'js');

  const money = (grosze) =>
    `${(grosze / 100).toLocaleString('pl-PL', {
      minimumFractionDigits: grosze % 100 ? 2 : 0,
      maximumFractionDigits: 2,
    })} zł`;

  // Koszyk: zmiana ilości od razu zapisuje koszyk (bez klikania "Zmień").
  document.querySelectorAll('form[data-autosubmit]').forEach((form) => {
    const input = form.querySelector('input[type="number"]');
    if (!input) return;
    input.addEventListener('change', () => {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
    });
  });

  // Zamówienie: pokazuj tylko pola potrzebne dla wybranej dostawy i licz sumę.
  const checkout = document.getElementById('checkout');
  if (checkout) {
    const groups = checkout.querySelectorAll('.ship-fields');
    const totals = checkout.querySelector('[data-subtotal]');
    const update = () => {
      const current = checkout.querySelector('input[name="shipping"]:checked');
      const needs = current ? current.dataset.needs : '';
      groups.forEach((group) => {
        group.hidden = group.dataset.for !== needs;
      });
      if (totals && current) {
        const subtotal = Number(totals.dataset.subtotal);
        const shipping = Number(current.dataset.price);
        totals.querySelector('[data-shipping-cost]').textContent = money(shipping);
        totals.querySelector('[data-grand-total]').textContent = money(subtotal + shipping);
      }
    };
    checkout.querySelectorAll('input[name="shipping"]').forEach((radio) => radio.addEventListener('change', update));
    update();
  }
})();
