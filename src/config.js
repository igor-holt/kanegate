import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_CONFIG_NAMES = ['kanegate.config.json', '.kanegate.json'];

const DEFAULTS = {
  maxIterations: 4,
  app: { start: null, url: 'http://localhost:3000', readyTimeoutSec: 30, cwd: '.' },
  kane: { bin: 'kane-cli', headless: true, maxSteps: 30, timeoutSec: 300, extraArgs: [] },
  agent: { preset: 'opencode', model: null, command: null, timeoutSec: 900 },
  deploy: { command: null },
  protect: [],
  flows: [],
};

export function findConfig(cwd, explicit) {
  if (explicit) return path.resolve(cwd, explicit);
  for (const n of DEFAULT_CONFIG_NAMES) {
    const p = path.join(cwd, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function loadConfig(file) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`Could not read config ${file}: ${e.message}`); }
  const root = path.dirname(file);
  const cfg = {
    ...DEFAULTS, ...raw,
    app: { ...DEFAULTS.app, ...(raw.app || {}) },
    kane: { ...DEFAULTS.kane, ...(raw.kane || {}) },
    agent: { ...DEFAULTS.agent, ...(raw.agent || {}) },
    deploy: { ...DEFAULTS.deploy, ...(raw.deploy || {}) },
  };
  cfg.root = root;
  cfg.file = file;
  cfg.app.cwd = path.resolve(root, cfg.app.cwd || '.');
  cfg.protect = [path.basename(file), ...(cfg.protect || [])];
  validate(cfg);
  return cfg;
}

function validate(cfg) {
  const errs = [];
  if (!Array.isArray(cfg.flows) || cfg.flows.length === 0) errs.push('`flows` must list at least one flow ({ "name", "objective" }).');
  const names = new Set();
  for (const [i, f] of (cfg.flows || []).entries()) {
    if (!f.name || !/^[a-zA-Z0-9_-]+$/.test(f.name)) errs.push(`flows[${i}].name must match [a-zA-Z0-9_-]+`);
    if (!f.objective) errs.push(`flows[${i}].objective is required (plain English, ending in a check of the result).`);
    if (names.has(f.name)) errs.push(`duplicate flow name ${f.name}`);
    names.add(f.name);
  }
  if (!cfg.app.url) errs.push('`app.url` is required.');
  if (!Number.isInteger(cfg.maxIterations) || cfg.maxIterations < 1) errs.push('`maxIterations` must be a positive integer.');
  if (errs.length) throw new Error('Invalid kanegate config:\n  - ' + errs.join('\n  - '));
}
