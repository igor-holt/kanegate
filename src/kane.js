import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { run, log, color, clip } from './util.js';
import { readEvidence } from './evidence.js';

/** Credentials: KANE_USERNAME / KANE_ACCESS_KEY (or LambdaTest-style LT_USERNAME / LT_ACCESS_KEY). */
export function kaneCredentials(env = process.env) {
  const username = env.KANE_USERNAME || env.LT_USERNAME;
  const accessKey = env.KANE_ACCESS_KEY || env.LT_ACCESS_KEY;
  return username && accessKey ? { username, accessKey } : null;
}

export function buildKaneArgs(cfg, flow, creds) {
  const k = cfg.kane;
  const args = ['run', flow.objective, '--agent', '--url', flow.url || cfg.app.url,
    '--max-steps', String(flow.maxSteps || k.maxSteps),
    '--timeout', String(flow.timeoutSec || k.timeoutSec)];
  if (k.headless) args.push('--headless');
  if (flow.variables) args.push('--variables', JSON.stringify(flow.variables));
  args.push(...(k.extraArgs || []), ...(flow.extraArgs || []));
  if (creds) args.push('--username', creds.username, '--access-key', creds.accessKey);
  return args;
}

const redact = (args) => args.map((a, i) => (args[i - 1] === '--access-key' ? '***' : a));

/**
 * Run one plain-English flow through `kane-cli run --agent` and normalise the NDJSON stream.
 * Returns { flow, status: 'passed'|'failed'|'error', reason, summary, steps[], runEnd, events[], evidence, exitCode, testUrl }.
 */
export async function runFlow(cfg, flow, outDir, { quiet = false } = {}) {
  const creds = kaneCredentials();
  const args = buildKaneArgs(cfg, flow, creds);
  const bin = process.env.KANEGATE_KANE_BIN || cfg.kane.bin;
  fs.writeFileSync(path.join(outDir, `${flow.name}.cmd.txt`), [bin, ...redact(args)].map((a) => JSON.stringify(a)).join(' ') + '\n');

  const events = [];
  const nonJson = [];
  const steps = [];
  let runEnd = null, sessionId = null, errorMsg = null, packHint = null;
  const res = await run(bin, args, {
    cwd: cfg.root,
    timeoutMs: ((flow.timeoutSec || cfg.kane.timeoutSec) + 60) * 1000,
    onStdoutLine: (line) => {
      if (!line.trim()) return;
      let ev;
      try { ev = JSON.parse(line); } catch { nonJson.push(line); return; }
      events.push(ev);
      if (ev.type === 'recording_state' && ev.session_id) sessionId = ev.session_id;
      if (ev.type === 'run_end') runEnd = ev;
      if (ev.type === 'error') errorMsg = ev.message;
      if (ev.type === 'coverage' && ev.pack) packHint = ev.pack;
      if ((typeof ev.step === 'number' || ev.type === 'step_end' || ev.type === 'step') && ev.status !== 'running') {
        steps.push({ step: ev.step ?? ev.index, status: ev.status, remark: ev.remark || ev.detail || ev.heading || '' });
        if (!quiet && ev.status) log(`    ${(ev.status === 'passed' || ev.status === 'done') ? color.green('✓') : ev.status === 'failed' ? color.red('✗') : color.dim('·')} ${color.dim(clip(ev.remark || ev.detail || ev.heading || '', 140))}`);
      }
    },
  });
  fs.writeFileSync(path.join(outDir, `${flow.name}.ndjson`), res.stdout);
  fs.writeFileSync(path.join(outDir, `${flow.name}.stderr.log`), res.stderr);

  const authProblem = /not authenticated|kane-cli login|unauthori[sz]ed|401/i.test(nonJson.join('\n') + '\n' + res.stderr + '\n' + (errorMsg || ''));
  let status;
  if (res.code === 0 && runEnd?.status === 'passed') status = 'passed';
  else if (res.code === 127) status = 'error';
  else if (!runEnd || res.code === 2 || authProblem) status = 'error';
  else status = 'failed';

  const reason = runEnd?.reason || errorMsg || (status === 'error' ? firstLine(nonJson) || firstLine(res.stderr.split('\n')) || `kane-cli exited ${res.code}` : null) || (res.timedOut || res.code === 3 ? 'Kane run timed out' : null);

  // Locate the sealed evidence pack: stderr hint first, then the session directory.
  let packPath = packHint || (res.stderr.match(/kane-cli evidence serve\s+`?([^\s`]+\.evidence)/) || [])[1] || null;
  if (!packPath && sessionId) {
    const dir = path.join(os.homedir(), '.testmuai/kaneai/sessions', sessionId, 'evidence');
    try { const f = fs.readdirSync(dir).filter((x) => x.endsWith('.evidence')).sort().pop(); if (f) packPath = path.join(dir, f); } catch {}
  }
  if (packPath && !path.isAbsolute(packPath)) packPath = path.resolve(cfg.root, packPath);
  const evidence = packPath && fs.existsSync(packPath) ? await readEvidence(packPath, outDir, flow.name) : null;

  return {
    flow: flow.name, objective: flow.objective, status, reason,
    summary: runEnd?.summary || null, duration: runEnd?.duration ?? null,
    testUrl: runEnd?.test_url || null, finalState: runEnd?.final_state || null,
    oneLiner: runEnd?.one_liner || null, reasonCode: runEnd?.reason_code || null,
    credits: sumCredits(runEnd),
    verdict: runEnd?.verdict ? pick(runEnd.verdict, ['status', 'family', 'category', 'severity', 'bug_title', 'root_cause', 'suggestion', 'one_liner', 'confidence', 'relevant_steps']) : null,
    steps, exitCode: res.code, evidence, sessionId,
  };
}

function firstLine(lines) { return (lines || []).map((l) => l.trim()).find(Boolean) || null; }

function pick(o, keys) { const r = {}; for (const k of keys) if (o[k] !== undefined && o[k] !== '') r[k] = o[k]; return r; }
/** Kane reports credits for the run and, separately, for its failure triage verdict. */
function sumCredits(runEnd) {
  if (!runEnd) return null;
  const a = Number(runEnd.credits_consumed) || 0, b = Number(runEnd.verdict?.credits_consumed) || 0;
  return a || b ? Math.round((a + b) * 100) / 100 : null;
}
