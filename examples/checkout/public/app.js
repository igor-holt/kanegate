(function () {
  const $ = (id) => document.getElementById(id);
  let applied = '';

  function qty() { return { widget: $('qty-widget').value, gadget: $('qty-gadget').value }; }

  function render() {
    const sub = Cart.subtotal(qty());
    const off = Math.min(Cart.discount(sub, applied), sub);
    $('subtotal').textContent = Cart.money(sub);
    $('discount').textContent = '-' + Cart.money(off);
    $('total').textContent = Cart.money(sub - off);
  }

  $('qty-widget').addEventListener('input', render);
  $('qty-gadget').addEventListener('input', render);

  $('apply-coupon').addEventListener('click', () => {
    const code = $('coupon').value.trim().toUpperCase();
    if (Cart.COUPONS[code]) { applied = code; $('coupon-status').textContent = `Coupon ${code} applied`; }
    else { applied = ''; $('coupon-status').textContent = 'Unknown coupon'; }
    render();
  });

  $('place-order').addEventListener('click', () => {
    const email = $('email').value.trim();
    if (!Cart.canCheckout(qty())) { $('message').textContent = 'Your cart is empty.'; return; }
    if (!/^\S+@\S+\.\S+$/.test(email)) { $('message').textContent = 'Please enter a valid email.'; return; }
    const sub = Cart.subtotal(qty());
    const total = sub - Math.min(Cart.discount(sub, applied), sub);
    const id = 'KG-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    $('message').textContent = `Order confirmed: ${id} — ${Cart.money(total)} charged to ${email}.`;
  });

  render();
})();
