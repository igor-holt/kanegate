// Judge for test/fake-kane.js (offline test double, not Kane). Loads the *served* cart.js from the
// running app and evaluates the two demo flows, so the loop sees the agent's real edits.
import vm from 'node:vm';

export async function judge(objective, url) {
  const src = await (await fetch(new URL('/cart.js', url))).text();
  const ctx = {}; vm.runInNewContext(src, ctx); const C = ctx.Cart;
  if (/SAVE10/.test(objective)) {
    const q = { widget: 2, gadget: 1 }; const sub = C.subtotal(q);
    const total = C.money(sub - Math.min(C.discount(sub, 'SAVE10'), sub));
    const steps = [
      { status: 'passed', remark: 'Set Widget quantity to 2' },
      { status: 'passed', remark: 'Set Gadget quantity to 1' },
      { status: 'passed', remark: 'Entered SAVE10 and clicked Apply; status shows "Coupon SAVE10 applied"' },
      { status: total === '$49.50' ? 'passed' : 'failed', remark: `Order total shows ${total}; expected $49.50` },
    ];
    return { passed: total === '$49.50', steps, final_state: { order_total: total }, summary: `Order total after SAVE10 is ${total}.`, reason: `Assertion failed: Order total is ${total}, expected $49.50` };
  }
  if (/Place order/.test(objective)) {
    const ok = C.canCheckout({ widget: 1, gadget: 0 });
    const msg = ok ? 'Order confirmed: KG-XXXXXX — $20.00 charged to buyer@example.com.' : 'Your cart is empty.';
    const steps = [
      { status: 'passed', remark: 'Set Widget quantity to 1' },
      { status: 'passed', remark: 'Typed buyer@example.com into Email' },
      { status: 'passed', remark: 'Clicked Place order' },
      { status: ok ? 'passed' : 'failed', remark: `Message shows "${msg}"` },
    ];
    return { passed: ok, steps, final_state: { message: msg }, summary: `After Place order the page says "${msg}"`, reason: `Assertion failed: expected a message containing 'Order confirmed' but the page shows "${msg}"` };
  }
  return { passed: false, steps: [], reason: 'fake judge: unknown objective', summary: '' };
}
