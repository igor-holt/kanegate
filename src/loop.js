import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { log, color, ensureDir, stamp, run, truncate, clip } from './util.js';
import { startApp, stopApp } from './app.js';
import { runFlow } from './kane.js';
import { buildFixPrompt } from './prompt.js';
import { runAgent, agentLabel } from './agent.js';
import { snapshotProtected, restoreProtected, beginAttemptDiff, endAttemptDiff } from './guard.js';
import { writeReport } from './report.js';

/**
 * The gate:  start app → Kane runs every flow → all green? deploy : feed failures to agent → repeat.
 * Exit codes: 0 deployed (or green with --dry-run), 1 blocked (still failing after maxIterations),
 *             2 gate error (Kane could not run: auth, Chrome, app never started).
 */
export async function gate(cfg, opts = {}) {
  const maxIterations = opts.maxIterations || cfg.maxIterations;
  const useAgent = opts.agent !== false;
  const runId = stamp();
  const runDir = ensureDir(path.join(cfg.root, '.kanegate', 'runs', runId));
  const kaneVersion = (await run(process.env.KANEGATE_KANE_BIN || cfg.kane.bin, ['--version'])).stdout.trim() || null;
  const summary = {
    runId, runDir, appUrl: cfg.app.url, agent: useAgent ? agentLabel(cfg.agent) : 'none (verify only)', kaneVersion,
    maxIterations, startedAt: new Date().toISOString(), iterations: [], deployed: false, outcome: null,
  };
  const flows = opts.only ? cfg.flows.filter((f) => opts.only.includes(f.name)) : cfg.flows;
  log(color.bold(`\nkanegate`) + color.dim(` · ${flows.length} flow(s) · up to ${maxIterations} attempt(s) · agent: ${summary.agent} · kane-cli ${kaneVersion || '?'}`));
  log(color.dim(`run dir: ${path.relative(process.cwd(), runDir) || runDir}`));

  const history = [];
  for (let i = 1; i <= maxIterations; i++) {
    const itDir = ensureDir(path.join(runDir, `attempt-${i}`));
    const it = { iteration: i, results: [] };
    summary.iterations.push(it);
    log(color.bold(`\n▶ Attempt ${i}/${maxIterations}`) + color.dim(` — starting app at ${cfg.app.url}`));

    let app;
    try { app = await startApp(cfg, path.join(itDir, 'app.log')); }
    catch (e) { log(color.red('  ' + e.message)); return finish('error', 2); }
    try {
      for (const flow of flows) {
        log(`  ${color.cyan('kane')} ${color.bold(flow.name)} ${color.dim('— ' + clip(flow.objective, 110))}`);
        const r = await runFlow(cfg, flow, itDir, { quiet: opts.quiet });
        it.results.push(r);
        const tag = r.status === 'passed' ? color.green('PASS') : r.status === 'failed' ? color.red('FAIL') : color.yellow('ERROR');
        log(`  ${tag} ${flow.name}${r.reason ? color.dim(' — ' + clip(r.reason, 200)) : ''}${r.duration != null ? color.dim(` (${r.duration}s${r.credits != null ? `, ${r.credits} credits` : ''})`) : ''}`);
        if (r.status === 'failed' && r.oneLiner) log(color.dim(`       kane: ${clip(r.oneLiner, 220)}`));
        if (r.status === 'error') break;
      }
    } finally { await stopApp(app); }

    const errors = it.results.filter((r) => r.status === 'error');
    const failures = it.results.filter((r) => r.status === 'failed');
    if (errors.length) {
      log(color.yellow(`\n⚠ Kane could not run: ${errors[0].reason}`));
      if (/authenticat|login/i.test(errors[0].reason || '')) log(color.dim('  Set KANE_USERNAME + KANE_ACCESS_KEY, or run `kane-cli login`. Then `kanegate doctor`.'));
      return finish('error', 2);
    }
    if (!failures.length) {
      log(color.green(color.bold(`\n✔ Kane signed off on all ${it.results.length} flow(s).`)));
      if (opts.dryRun || !cfg.deploy.command) {
        log(color.dim(opts.dryRun ? '  --dry-run: deploy skipped.' : '  No deploy.command configured: nothing to deploy.'));
        return finish('dry-run', 0);
      }
      log(color.bold(`\n🚀 Deploying: `) + cfg.deploy.command);
      const d = await run(cfg.deploy.command, [], {
        cwd: cfg.app.cwd, shell: true,
        env: { KANEGATE_RUN_ID: runId, KANEGATE_RUN_DIR: runDir, KANEGATE_FLOWS_PASSED: it.results.map((r) => r.flow).join(',') },
        onStdoutLine: (l) => log(color.dim('  │ ' + l)), onStderrLine: (l) => log(color.dim('  │ ' + l)),
      });
      summary.deploy = { command: cfg.deploy.command, exitCode: d.code, output: d.stdout + d.stderr };
      summary.deployed = d.code === 0;
      log(d.code === 0 ? color.green(color.bold('✔ Deployed.')) : color.red(`✗ Deploy command failed (exit ${d.code}).`));
      return finish(d.code === 0 ? 'deployed' : 'deploy-failed', d.code === 0 ? 0 : 1);
    }

    log(color.red(color.bold(`\n⛔ Deploy blocked: ${failures.length} flow(s) failed.`)));
    if (!useAgent) return finish('blocked', 1);
    if (i === maxIterations) { log(color.red(`  Out of attempts (${maxIterations}).`)); return finish('blocked', 1); }

    // Close the loop: Kane's verdict + evidence → re-prompt → agent edits the code.
    const prompt = buildFixPrompt(cfg, failures, { iteration: i, maxIterations, history });
    const promptFile = path.join(itDir, 'agent-prompt.md');
    log(`  ${color.magenta('agent')} ${agentLabel(cfg.agent)} ${color.dim('← Kane failure report (' + prompt.length + ' chars) ' + path.relative(process.cwd(), promptFile))}`);
    const snap = snapshotProtected(cfg);
    const indexFile = path.join(os.tmpdir(), `kanegate-${process.pid}-${runId}-${i}.index`);
    const diffHandle = await beginAttemptDiff(cfg.app.cwd, indexFile);
    const t0 = Date.now();
    let ar;
    try { ar = await runAgent(cfg, prompt, promptFile, path.join(itDir, 'agent.log')); }
    catch (e) { log(color.red('  ' + e.message)); return finish('error', 2); }
    const tampered = restoreProtected(snap).map((p) => path.relative(cfg.root, p));
    const diff = await endAttemptDiff(diffHandle);
    fs.rmSync(indexFile, { force: true });
    if (diff?.patch) fs.writeFileSync(path.join(itDir, 'agent.diff'), diff.patch);
    const files = (diff?.files || []).filter((f) => !f.startsWith('.kanegate/'));
    it.agent = {
      promptFile: path.relative(runDir, promptFile), exitCode: ar.code, seconds: Math.round((Date.now() - t0) / 1000),
      files, tampered, reply: truncate(stripAnsi(ar.stdout).trim().split('\n').slice(-8).join('\n'), 1200),
    };
    log(`  ${color.magenta('agent')} exit ${ar.code} in ${it.agent.seconds}s · changed: ${files.length ? files.join(', ') : 'nothing'}`);
    if (tampered.length) log(color.yellow(`  ⚠ agent edited protected files; reverted: ${tampered.join(', ')}`));
    history.push({ iteration: i, failed: failures.map((f) => f.flow), changed: files.join(', ') });
    writeReport(runDir, { ...summary, finishedAt: new Date().toISOString() });
  }
  return finish('blocked', 1);

  function finish(outcome, code) {
    summary.outcome = outcome;
    summary.finishedAt = new Date().toISOString();
    summary.exitCode = code;
    writeReport(runDir, summary);
    log(color.dim(`\nreport: ${path.relative(process.cwd(), path.join(runDir, 'REPORT.md'))}`));
    return { code, summary };
  }
}

function stripAnsi(s) { return String(s || '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, ''); }
