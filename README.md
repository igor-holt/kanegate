# kanegate

**Refuse to deploy until Kane signs off.**

Coding agents write code quickly, but they can't tell whether the app actually works. `kanegate` puts
[Kane CLI](https://github.com/LambdaTest/kane-cli) between your agent and your deploy:

```
            ┌──────────────────────────────────────────────────────────────┐
            ▼                                                              │
  start app ──► Kane CLI runs each plain-English flow in real Chrome ──► all pass? ──yes──► deploy
                                                                           │
                                                                           no
                                                                           ▼
             coding agent ◄── re-prompt: objective, Kane's reason, steps, ─┘
          (OpenCode, Claude      extracted values, failure.yaml, console
           Code, Codex, …)       errors, failing screenshot from the evidence pack
```

- **Kane is the only judge.** The deploy command runs only after `kane-cli run --agent` reports `passed` for every flow.
- **Closed loop, no human relay.** kanegate parses Kane's NDJSON and evidence pack and hands the agent a precise fix-it prompt. It then restarts the app and has Kane re-check, up to `maxIterations`.
- **The agent can't game it.** The config and flow objectives are protected. If the agent edits them, kanegate reverts the edits and flags them in the report.
- **Everything is on the record.** Each attempt keeps Kane's raw NDJSON, the evidence pack, the failing screenshot, the exact prompt, the agent's reply and the agent's diff, all rolled up in `REPORT.md`.
- **Zero dependencies.** It needs Node 18+, `kane-cli` and the agent you already use.

## Install

```bash
npm install -g @testmuai/kane-cli          # Kane CLI (needs Google Chrome stable)
npm install -g github:igor-holt/kanegate    # this tool  (or: git clone … && npm link)
```

Kane needs a TestMu AI account. Use either:

```bash
export KANE_USERNAME="you@example.com"     # TestMu AI username
export KANE_ACCESS_KEY="…"                 # TestMu AI dashboard → profile → access key
# or, interactively once per machine:
kane-cli login
```

Then run `kanegate doctor`. It checks kane-cli, your Kane auth, Chrome and your agent.

## 60-second demo (seeded bugs)

`examples/checkout` is a tiny store with **two real bugs seeded on purpose**:

1. The `SAVE10` coupon takes $10 off instead of 10%. For 2 Widgets + 1 Gadget the total shows **$45.00 instead of $49.50**.
2. A single-item cart can't check out. It says "Your cart is empty." because of an off-by-one (`> 1`).

```bash
git clone https://github.com/igor-holt/kanegate && cd kanegate
npm test             # offline unit + loop tests (uses a Kane test double, no account needed)
npm run demo:check   # Kane only: both flows FAIL, deploy blocked, exit 1
npm run demo         # full loop: Kane fails → OpenCode fixes → Kane passes → deploy → exit 0
npm run demo:reset   # put the bugs back
```

The flows are plain English in `examples/checkout/kanegate.config.json`:

```json
{
  "app":   { "start": "node server.js", "url": "http://localhost:4173" },
  "flows": [
    { "name": "coupon-total",
      "objective": "Set the Widget quantity to 2 and the Gadget quantity to 1. Type SAVE10 into the Coupon code field and click Apply. Verify the Order total shows $49.50." },
    { "name": "single-item-checkout",
      "objective": "Set the Widget quantity to 1 and leave the Gadget quantity at 0. Type buyer@example.com into the Email field and click Place order. Verify a message containing 'Order confirmed' is shown." }
  ],
  "agent":  { "preset": "opencode" },
  "deploy": { "command": "node scripts/deploy.js" }
}
```

The demo's "deploy" publishes `public/` to `dist/` and stamps `dist/DEPLOYED.json` with the run id and the flows Kane passed. Point `deploy.command` at your real deploy (`npx vercel deploy --prod`, `fly deploy`, …).

## Use it on your app

```bash
cd your-app && kanegate init     # writes kanegate.config.json, then edit the flows
kanegate check                   # CI gate: Kane only, exit 0 green / 1 red / 2 couldn't run
kanegate run                     # agent loop + deploy on green
kanegate run --agent claude      # or codex, gemini, opencode; --model <id> to pick a model
kanegate run --dry-run --json    # everything except deploy; machine-readable summary on stdout
```

| Config key | Default | Meaning |
|---|---|---|
| `app.start` | none | Command that serves the app (run in its own process group, restarted every attempt). Omit it if the app is already up. |
| `app.url` | `http://localhost:3000` | Start URL handed to Kane (`--url`) and polled for readiness |
| `flows[]` | required | `{ name, objective, maxSteps?, timeoutSec?, variables?, extraArgs? }`. End each objective with a check of the result. |
| `agent.preset` | `opencode` | `opencode` · `claude` · `codex` · `gemini`. Use `agent.model` to choose the model. |
| `agent.command` | none | Custom agent shell command. The prompt path is available as `{promptFile}` and `$KANEGATE_PROMPT_FILE`. |
| `deploy.command` | none | Runs only on all-green. It receives `KANEGATE_RUN_ID` and `KANEGATE_FLOWS_PASSED`. |
| `maxIterations` | `4` | Kane→agent attempts before giving up |
| `kane.headless` / `kane.maxSteps` / `kane.timeoutSec` / `kane.extraArgs` | `true` / `30` / `300` / `[]` | Passed through to `kane-cli run` |
| `protect[]` | config file | Extra files the agent may not change (reverted if it does) |

**Exit codes:** `0` deployed (or green with `check`/`--dry-run`) · `1` blocked (Kane still failing) · `2` gate error (Kane auth, Chrome, or the app never came up). Kane infrastructure errors are **never** sent to the agent as "bugs".

### GitHub Action

```yaml
- uses: igor-holt/kanegate@main
  with:
    command: check                      # or: run
    working-directory: .
    kane-username: ${{ secrets.KANE_USERNAME }}
    kane-access-key: ${{ secrets.KANE_ACCESS_KEY }}
```

The action writes `REPORT.md` to the job summary and uploads the Kane NDJSON, evidence packs and agent transcripts as an artifact.

## How Kane and the agent talk

1. kanegate runs `kane-cli run "<objective>" --agent --headless --url <app> --max-steps N --timeout S` for each flow.
2. It reads the NDJSON stream: step lines (`{"step":n,"status":…,"remark":…}`) and `run_end` (`status`, `reason`, `summary`, `final_state`, `test_url`). It also checks the exit code (0 pass, 1 fail, 2 error, 3 timeout).
3. It finds the sealed **evidence pack** (from the `coverage` event's `pack`, the `kane-cli evidence serve <pack>` hint, or `~/.testmuai/kaneai/sessions/<session_id>/evidence/`). It also keeps Kane's failure triage from `run_end.verdict` (bug title, root cause, suggestion, and whether Kane suspects the product or the test) and `credits_consumed`. From the pack it pulls `failure.yaml`, per-step failure records, console errors and the failing step's screenshot.
4. It builds `agent-prompt.md`: the objective, Kane's reason, the step trail, the values Kane extracted, the evidence excerpts, the screenshot path, earlier attempts and the rule "change the product, not the test". The agent runs headless (`opencode run …`).
5. It reverts any edits to protected files, records the agent's diff, restarts the app and goes back to step 1.

## Recorded runs (fallback for judges)

- `docs/recorded-runs/offline-rehearsal/`: the loop with the **real OpenCode agent** fixing both seeded bugs in one attempt. Kane was replaced by a **test double** (`test/fake-kane.js`) there, as that README states up front.
- `docs/recorded-runs/kane-live/`: the same demo against **real Kane CLI**, produced by `scripts/record-live-run.sh`. Kane failed both flows on the seeded bugs ("Order total $45.00, not the required $49.50"; "shows 'Your cart is empty' despite Widget quantity 1"). OpenCode fixed `public/cart.js` from Kane's report, Kane passed both flows on attempt 2, and the deploy ran. It has Kane's raw NDJSON, screenshots, the prompt and the diff.

## Development

```bash
npm test   # node:test, no deps; Kane is stubbed by test/fake-kane.js (NDJSON-compatible test double)
```

Built for the [KaneCLI Online Hackathon](https://www.kaneclihack.sh/) (Nov 12–26, 2026). MIT license.
