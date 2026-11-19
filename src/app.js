import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { log, color } from './util.js';

/** Start the app under test (if `app.start` is set) and wait until `app.url` answers. */
export async function startApp(cfg, logFile) {
  let child = null;
  if (cfg.app.start) {
    const out = fs.openSync(logFile, 'a');
    child = spawn(cfg.app.start, { cwd: cfg.app.cwd, shell: true, detached: true, stdio: ['ignore', out, out] });
    child.unref();
  }
  const ok = await waitForUrl(cfg.app.url, cfg.app.readyTimeoutSec * 1000, () => child && child.exitCode !== null);
  if (!ok) {
    await stopApp(child);
    throw new Error(`App did not become ready at ${cfg.app.url} within ${cfg.app.readyTimeoutSec}s (see ${logFile}).`);
  }
  return child;
}

export async function stopApp(child) {
  if (!child || child.exitCode !== null) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 30 && child.exitCode === null; i++) await sleep(100);
  try { process.kill(-child.pid, 'SIGKILL'); } catch {}
}

export async function waitForUrl(url, timeoutMs, died = () => false) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (died()) return false;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.status < 500) return true;
    } catch {}
    await sleep(300);
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { log, color };
