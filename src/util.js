import { spawn } from 'node:child_process';
import fs from 'node:fs';

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const color = {
  dim: c('2'), bold: c('1'), red: c('31'), green: c('32'), yellow: c('33'), cyan: c('36'), magenta: c('35'),
};

// All human-facing output goes to stderr so `--json` stdout stays machine-readable.
export const log = (...a) => process.stderr.write(a.join(' ') + '\n');

export function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); return p; }

export function which(bin) {
  const paths = (process.env.PATH || '').split(':');
  for (const p of paths) {
    const full = `${p}/${bin}`;
    try { fs.accessSync(full, fs.constants.X_OK); return full; } catch {}
  }
  return null;
}

/**
 * Run a process, capturing stdout/stderr. Optional `onStdoutLine` streams lines.
 * Resolves { code, stdout, stderr, timedOut }.
 */
export function run(cmd, args, { cwd, env, timeoutMs, onStdoutLine, onStderrLine, shell = false, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd, env: { ...process.env, ...env }, shell,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    if (input !== undefined) { child.stdin.end(input); }
    let stdout = '', stderr = '', outBuf = '', errBuf = '', timedOut = false;
    const flush = (buf, cb) => {
      const parts = buf.split('\n'); const rest = parts.pop();
      if (cb) parts.forEach((l) => cb(l));
      return rest;
    };
    child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; outBuf = flush(outBuf + s, onStdoutLine); });
    child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; errBuf = flush(errBuf + s, onStderrLine); });
    let timer;
    if (timeoutMs) timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000); }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: 127, stdout, stderr: stderr + String(err), timedOut }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (outBuf && onStdoutLine) onStdoutLine(outBuf);
      if (errBuf && onStderrLine) onStderrLine(errBuf);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

export function truncate(s, n = 4000) {
  if (!s) return '';
  s = String(s);
  return s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s;
}

/** One-line, terminal-friendly clip. */
export function clip(s, n = 120) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
