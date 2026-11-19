# Live run: real Kane CLI + real OpenCode (Nov 19, 2026, 9:25–9:30 AM ET)

`scripts/record-live-run.sh` against `examples/checkout`. Kane CLI 0.10.6 (headless Chrome, Linux) and OpenCode 1.19.5 (default free model).
Nothing in this run was simulated.

| Attempt | coupon-total | single-item-checkout | Then |
|---|---|---|---|
| 1 | ❌ Kane: "Required quantities and SAVE10 yield displayed Order total $45.00, not the required $49.50." | ❌ Kane: "Order submission shows 'Your cart is empty' despite Widget quantity 1, so no confirmation message can be verified." | Deploy blocked; Kane's report went to OpenCode (78 s), which changed `public/cart.js` (see `attempt-1/agent.diff`) |
| 2 | ✅ passed | ✅ passed | Deploy ran (`dist/DEPLOYED.json` stamped) |

The whole run took 5 min 19 s. Kane reported 61.21 credits; the account balance dropped by 64.29.

| File | What it is |
|---|---|
| `terminal.log` | kanegate's live output |
| `attempt-N/*.ndjson` | Kane's raw `--agent` NDJSON for each flow (`run_end` includes reason, triage verdict, credits, share link) |
| `attempt-1/*.failure.jpg` | Screenshot from Kane's evidence pack at the step Kane marked failed |
| `attempt-2/*.last-step.jpg` | Last-step screenshot from the passing runs |
| `attempt-1/agent-prompt.md` | Exactly what OpenCode received |
| `attempt-1/agent.diff` | What OpenCode changed |
| `REPORT.md` | kanegate's run report |

Evidence packs (`.evidence` zips) are not committed because of their size.
