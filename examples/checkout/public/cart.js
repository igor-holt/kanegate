// Pricing rules for Kart. Loaded in the browser (window.Cart) and in Node tests.
(function (root) {
  const PRICES = { widget: 2000, gadget: 1500 }; // cents
  const COUPONS = { SAVE10: { type: 'percent', value: 10 } };

  function subtotal(qty) {
    return Object.keys(PRICES).reduce((sum, k) => sum + PRICES[k] * (Number(qty[k]) || 0), 0);
  }

  function discount(sub, code) {
    const c = COUPONS[String(code || '').trim().toUpperCase()];
    if (!c) return 0;
    // 10% off the subtotal
    return c.value * 100;
  }

  function itemCount(qty) {
    return Object.values(qty).reduce((n, q) => n + (Number(q) || 0), 0);
  }

  function canCheckout(qty) {
    return itemCount(qty) > 1;
  }

  const money = (cents) => '$' + (cents / 100).toFixed(2);

  const Cart = { PRICES, COUPONS, subtotal, discount, itemCount, canCheckout, money };
  if (typeof module !== 'undefined' && module.exports) module.exports = Cart;
  root.Cart = Cart;
})(typeof window !== 'undefined' ? window : globalThis);
