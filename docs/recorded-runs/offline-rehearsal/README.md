# Offline rehearsal (Kane test double, real OpenCode agent)

**Read this first:** this recording was made **without** Kane CLI. Kane was swapped for
`test/fake-kane.js`, a test double that speaks Kane's documented `--agent` NDJSON contract
(`stream_start` → step lines → `run_end`, exit 0/1/2) but does **not** drive a browser. Its verdicts
come from `examples/checkout/test/fake-judge.js`, which evaluates the cart code the app is serving.

What is real here: the kanegate loop, the app server, the re-prompt, the **OpenCode** coding agent
(`opencode run`, default free model) editing `public/cart.js`, the per-attempt diff, the protected-file
guard, and the deploy step. Recorded 2026-11-19 on Linux, Node 24, OpenCode 1.19.5.

The live recording with real Kane CLI goes in `../kane-live/` (see `scripts/record-live-run.sh`).

| File | What it is |
|---|---|
| `terminal.log` | kanegate's stderr for the whole run |
| `agent-prompt.md` | Exactly what the agent received after attempt 1 |
| `agent.diff` | What the agent changed in response |
| `REPORT.md` | The run report kanegate wrote |
