# Kane CLI blocked this deploy (attempt 1 of 4)

Kane CLI just ran the app's user flows in a real Chrome browser against http://localhost:4173. 2 flow(s) failed. The deploy is blocked until every flow passes.

## Your job
Fix the application code in this repository so the failing flows below pass in a real browser.
- Change the product, not the test. Do NOT edit `kanegate.config.json` or weaken any flow. Edits to protected files are reverted automatically.
- Keep the fix minimal and focused on the behaviour Kane reported.
- Do not start or deploy the app; kanegate restarts it and re-runs Kane after you finish.

## Failed flow: `coupon-total`

**Objective Kane executed (plain English):**
> Set the Widget quantity to 2 and the Gadget quantity to 1. Type SAVE10 into the Coupon code field and click Apply. Verify the Order total shows $49.50.

**Kane's failure reason:** Assertion failed: Order total is $45.00, expected $49.50
**Kane's summary:** Order total after SAVE10 is $45.00.
**Values Kane extracted:** `{"order_total":"$45.00"}`

**Steps Kane took:**
- step 1 [passed] Set Widget quantity to 2
- step 2 [passed] Set Gadget quantity to 1
- step 3 [passed] Entered SAVE10 and clicked Apply; status shows "Coupon SAVE10 applied"
- step 4 [failed] Order total shows $45.00; expected $49.50

## Failed flow: `single-item-checkout`

**Objective Kane executed (plain English):**
> Set the Widget quantity to 1 and leave the Gadget quantity at 0. Type buyer@example.com into the Email field and click Place order. Verify a message containing 'Order confirmed' is shown.

**Kane's failure reason:** Assertion failed: expected a message containing 'Order confirmed' but the page shows "Your cart is empty."
**Kane's summary:** After Place order the page says "Your cart is empty."
**Values Kane extracted:** `{"message":"Your cart is empty."}`

**Steps Kane took:**
- step 1 [passed] Set Widget quantity to 1
- step 2 [passed] Typed buyer@example.com into Email
- step 3 [passed] Clicked Place order
- step 4 [failed] Message shows "Your cart is empty."

When you are done, reply with one short paragraph naming the root cause and the file(s) you changed.