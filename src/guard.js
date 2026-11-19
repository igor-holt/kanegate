import fs from 'node:fs';
import path from 'node:path';
import { run } from './util.js';

// Never count kanegate/Kane artifacts or build output as agent changes.
const SPEC = ['.', ':(exclude).kanegate', ':(exclude).testmuai', ':(exclude)dist', ':(exclude)node_modules'];

/** Snapshot protected files (config + flow specs) so the agent cannot "pass" by editing the test. */
export function snapshotProtected(cfg) {
  const snap = new Map();
  for (const rel of cfg.protect) {
    const p = path.resolve(cfg.root, rel);
    snap.set(p, fs.existsSync(p) ? fs.readFileSync(p) : null);
  }
  return snap;
}

export function restoreProtected(snap) {
  const tampered = [];
  for (const [p, buf] of snap) {
    const now = fs.existsSync(p) ? fs.readFileSync(p) : null;
    const same = (buf === null && now === null) || (buf && now && Buffer.compare(buf, now) === 0);
    if (!same) {
      tampered.push(p);
      if (buf === null) fs.rmSync(p, { force: true }); else fs.writeFileSync(p, buf);
    }
  }
  return tampered;
}

/** Best-effort diff of what the agent changed (git working tree vs HEAD, limited to the app dir). */
export async function gitDiff(cwd) {
  const inside = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
  if (inside.code !== 0) return null;
  const diff = await run('git', ['diff', '--no-color', '--', '.'], { cwd });
  const stat = await run('git', ['diff', '--stat', '--no-color', '--', '.'], { cwd });
  return { patch: diff.stdout, stat: stat.stdout.trim() };
}

/**
 * Per-attempt diff without touching the user's real index: snapshot the working tree into a
 * throwaway git index before the agent runs, then diff the working tree against it afterwards.
 */
export async function beginAttemptDiff(cwd, indexFile) {
  const inside = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
  if (inside.code !== 0) return null;
  const env = { GIT_INDEX_FILE: indexFile };
  await run('git', ['read-tree', 'HEAD'], { cwd, env });
  await run('git', ['add', '-A', '--', ...SPEC], { cwd, env });
  return { cwd, env };
}

export async function endAttemptDiff(handle) {
  if (!handle) return null;
  const { cwd, env } = handle;
  await run('git', ['add', '-N', '--', ...SPEC], { cwd, env });
  const patch = await run('git', ['diff', '--no-color', '--', ...SPEC], { cwd, env });
  const names = await run('git', ['diff', '--name-only', '--', ...SPEC], { cwd, env });
  return { patch: patch.stdout, files: names.stdout.split('\n').filter(Boolean) };
}
