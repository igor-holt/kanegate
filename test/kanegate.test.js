import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildKaneArgs } from '../src/kane.js';
import { buildFixPrompt } from '../src/prompt.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const bin = path.join(repo, 'bin/kanegate.js');
const fakeKane = path.join(here, 'fake-kane.js');

function demoCopy(port) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanegate-'));
  fs.cpSync(path.join(repo, 'examples/checkout'), dir, { recursive: true, filter: (s) => !s.includes('/dist') && !s.includes('.kanegate') });
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'kanegate.config.json'), 'utf8'));
  cfg.app.start = `PORT=${port} node server.js`; cfg.app.url = `http://localhost:${port}`;
  fs.writeFileSync(path.join(dir, 'kanegate.config.json'), JSON.stringify(cfg, null, 2));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: dir });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'seed'], { cwd: dir });
  return dir;
}
const env = (dir, extra = {}) => ({ ...process.env, NO_COLOR: '1', KANEGATE_KANE_BIN: fakeKane, FAKE_KANE_JUDGE: path.join(dir, 'test/fake-judge.js'), ...extra });

test('kane args: agent NDJSON, headless, url, and creds never logged', () => {
  const cfg = { app: { url: 'http://localhost:1' }, kane: { headless: true, maxSteps: 30, timeoutSec: 300, extraArgs: [] } };
  const a = buildKaneArgs(cfg, { name: 'x', objective: 'do it' }, { username: 'u', accessKey: 'k' });
  assert.deepEqual(a.slice(0, 5), ['run', 'do it', '--agent', '--url', 'http://localhost:1']);
  assert.ok(a.includes('--headless'));
  assert.equal(a[a.indexOf('--access-key') + 1], 'k');
});

test('fix prompt carries objective, reason, steps, and protects the config', () => {
  const p = buildFixPrompt({ app: { url: 'u' }, protect: ['kanegate.config.json'], root: '/' },
    [{ flow: 'f', objective: 'verify total $49.50', reason: 'total was $45.00', steps: [{ step: 4, status: 'failed', remark: 'Order total shows $45.00' }] }],
    { iteration: 1, maxIterations: 3 });
  assert.match(p, /verify total \$49\.50/); assert.match(p, /total was \$45\.00/); assert.match(p, /step 4 \[failed\]/); assert.match(p, /Do NOT edit `kanegate.config.json`/);
});

test('check: seeded bugs block the deploy (exit 1)', () => {
  const dir = demoCopy(47311);
  const r = spawnSync('node', [bin, 'check'], { cwd: dir, env: env(dir), encoding: 'utf8' });
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /FAIL coupon-total/); assert.match(r.stderr, /FAIL single-item-checkout/);
  assert.ok(!fs.existsSync(path.join(dir, 'dist')));
});

test('auth failure is a gate error (exit 2), never sent to the agent', () => {
  const dir = demoCopy(47312);
  const r = spawnSync('node', [bin, 'run'], { cwd: dir, env: env(dir, { FAKE_KANE_AUTH: 'fail' }), encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /Kane could not run/);
  assert.doesNotMatch(r.stderr, /agent .*← Kane failure report/);
});

test('closed loop: agent fixes code from Kane feedback, protected edits reverted, deploy only on green', () => {
  const dir = demoCopy(47313);
  // A scripted "agent" that applies the fix only if the Kane failure details reached it, and also tries to cheat.
  const fixer = path.join(dir, 'fixer.sh');
  fs.writeFileSync(fixer, `#!/bin/sh
set -e
grep -q 'expected \\$49.50' "$KANEGATE_PROMPT_FILE"
grep -q "Order confirmed" "$KANEGATE_PROMPT_FILE"
sed -i 's/return c.value \\* 100;/return Math.round(sub * c.value \\/ 100);/; s/itemCount(qty) > 1/itemCount(qty) >= 1/' public/cart.js
sed -i 's/\\$49.50/$45.00/' kanegate.config.json
echo "fixed percent coupon + single-item checkout in public/cart.js"
`);
  fs.chmodSync(fixer, 0o755);
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'kanegate.config.json'), 'utf8'));
  cfg.agent = { command: 'sh fixer.sh' };
  fs.writeFileSync(path.join(dir, 'kanegate.config.json'), JSON.stringify(cfg, null, 2));
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qam', 'cfg'], { cwd: dir });

  const r = spawnSync('node', [bin, 'run', '--json'], { cwd: dir, env: env(dir), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.equal(s.iterations.length, 2);
  assert.deepEqual(s.iterations[0].results.map((x) => x.status), ['failed', 'failed']);
  assert.deepEqual(s.iterations[1].results.map((x) => x.status), ['passed', 'passed']);
  assert.deepEqual(s.iterations[0].agent.tampered, ['kanegate.config.json']);
  assert.deepEqual(s.iterations[0].agent.files, ['public/cart.js']);
  assert.ok(s.deployed);
  assert.match(fs.readFileSync(path.join(dir, 'kanegate.config.json'), 'utf8'), /\$49\.50/);
  const stamp = JSON.parse(fs.readFileSync(path.join(dir, 'dist/DEPLOYED.json'), 'utf8'));
  assert.deepEqual(stamp.kaneFlowsPassed, ['coupon-total', 'single-item-checkout']);
  assert.ok(fs.existsSync(path.join(s.runDir, 'REPORT.md')));
});
