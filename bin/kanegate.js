#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { findConfig, loadConfig } from '../src/config.js';
import { gate } from '../src/loop.js';
import { doctor } from '../src/doctor.js';
import { init } from '../src/init.js';
import { log, color } from '../src/util.js';

const HELP = `kanegate — refuse to deploy until Kane CLI signs off.

Usage
  kanegate run      Kane verifies every flow → failures go back to your coding agent → repeat → deploy on green
  kanegate check    Kane verifies every flow once. No agent, no deploy. Exit 0 green / 1 red (CI gate)
  kanegate doctor   Check kane-cli, Kane credentials, Chrome, and your agent
  kanegate init     Write a starter kanegate.config.json

Options
  -c, --config <file>        Config file (default: ./kanegate.config.json)
  -n, --max-iterations <n>   Agent attempts before giving up (default: config.maxIterations)
      --agent <preset>       opencode | claude | codex | gemini (overrides config)
      --model <id>           Model for the agent preset
      --only <flow,...>      Run only these flows
      --dry-run              Do everything except the deploy command
      --json                 Print the run summary as JSON on stdout
  -q, --quiet                Hide Kane's per-step progress
  -h, --help

Kane credentials: KANE_USERNAME + KANE_ACCESS_KEY (or LT_USERNAME + LT_ACCESS_KEY), or a prior \`kane-cli login\`.
Exit codes: 0 deployed/green · 1 blocked (Kane still failing) · 2 gate error (Kane/app could not run)`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: 'string', short: 'c' },
    'max-iterations': { type: 'string', short: 'n' },
    agent: { type: 'string' },
    model: { type: 'string' },
    only: { type: 'string' },
    'dry-run': { type: 'boolean' },
    json: { type: 'boolean' },
    quiet: { type: 'boolean', short: 'q' },
    help: { type: 'boolean', short: 'h' },
  },
});

const cmd = positionals[0] || (values.help ? 'help' : 'help');
try {
  if (cmd === 'help' || values.help) { log(HELP); process.exit(0); }
  if (cmd === 'init') { const f = init(process.cwd()); log(color.green('✓ wrote ' + f)); process.exit(0); }

  const file = findConfig(process.cwd(), values.config);
  if (cmd === 'doctor') {
    const cfg = file ? loadConfig(file) : null;
    process.exit((await doctor(cfg)) ? 0 : 2);
  }
  if (!file) throw new Error('No kanegate.config.json found. Run `kanegate init` or pass --config.');
  const cfg = loadConfig(file);
  if (values.agent) { cfg.agent.preset = values.agent; cfg.agent.command = null; }
  if (values.model) cfg.agent.model = values.model;

  if (cmd === 'run' || cmd === 'check') {
    const { code, summary } = await gate(cfg, {
      agent: cmd === 'run',
      dryRun: cmd === 'check' || values['dry-run'],
      maxIterations: cmd === 'check' ? 1 : values['max-iterations'] ? Number(values['max-iterations']) : undefined,
      only: values.only ? values.only.split(',') : undefined,
      quiet: values.quiet,
    });
    if (values.json) process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    process.exit(code);
  }
  throw new Error(`Unknown command "${cmd}". See kanegate --help.`);
} catch (e) {
  log(color.red('kanegate: ' + e.message));
  process.exit(2);
}
