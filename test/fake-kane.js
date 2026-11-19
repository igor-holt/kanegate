#!/usr/bin/env node
// TEST DOUBLE for `kane-cli run --agent`. It does NOT drive a browser and is NOT Kane.
// It mimics Kane's documented NDJSON contract (stream_start, step lines, run_end, exit 0/1/2)
// so kanegate's loop can be tested offline. Verdicts come from a judge module:
//   FAKE_KANE_JUDGE=/abs/path/judge.js  exporting  async judge(objective, url) -> { passed, steps[], reason, summary }
// FAKE_KANE_AUTH=fail simulates an unauthenticated kane-cli.
const argv = process.argv.slice(2);
if (argv[0] === '--version') { console.log('0.0.0-fake'); process.exit(0); }
if (argv[0] === 'whoami') { console.log(process.env.FAKE_KANE_AUTH === 'fail' ? 'Not logged in' : 'fake user'); process.exit(0); }
const objective = argv[1];
const url = argv[argv.indexOf('--url') + 1];
const emit = (o) => process.stdout.write(JSON.stringify({ ...o, v: 1, ts: new Date().toISOString() }) + '\n');
emit({ type: 'stream_start', cli_version: '0.0.0-fake', surface: 'run', pid: process.pid });
if (process.env.FAKE_KANE_AUTH === 'fail') {
  console.log('Not authenticated. Run: kane-cli login --oauth, or kane-cli login --username <user> --access-key <key>');
  process.exit(1);
}
const { judge } = await import(process.env.FAKE_KANE_JUDGE);
const t0 = Date.now();
const r = await judge(objective, url);
r.steps.forEach((s, i) => emit({ step: i + 1, status: s.status, remark: s.remark }));
emit({ type: 'run_end', status: r.passed ? 'passed' : 'failed', duration: (Date.now() - t0) / 1000, summary: r.summary, reason: r.passed ? undefined : r.reason, final_state: r.final_state || {} });
process.exit(r.passed ? 0 : 1);
