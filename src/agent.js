import fs from 'node:fs';
import { run, which } from './util.js';

/**
 * Coding-agent adapters. Each returns [cmd, args, opts]. The prompt is passed as an argument
 * (never through a shell) and is also written to promptFile for custom commands.
 */
const PRESETS = {
  opencode: (p, a) => ['opencode', ['run', ...(a.model ? ['-m', a.model] : []), p]],
  claude: (p, a) => ['claude', ['-p', p, '--permission-mode', 'acceptEdits', ...(a.model ? ['--model', a.model] : [])]],
  codex: (p, a) => ['codex', ['exec', '--full-auto', ...(a.model ? ['-m', a.model] : []), p]],
  gemini: (p, a) => ['gemini', ['--yolo', ...(a.model ? ['-m', a.model] : []), '-p', p]],
};
export const AGENT_PRESETS = Object.keys(PRESETS);

export function agentLabel(agentCfg) {
  if (agentCfg.command) return `custom: ${agentCfg.command}`;
  return agentCfg.preset + (agentCfg.model ? ` (${agentCfg.model})` : '');
}

export function agentBinary(agentCfg) {
  if (agentCfg.command) return null;
  return PRESETS[agentCfg.preset] ? PRESETS[agentCfg.preset]('', agentCfg)[0] : null;
}

export async function runAgent(cfg, prompt, promptFile, logFile, { onLine } = {}) {
  const a = cfg.agent;
  fs.writeFileSync(promptFile, prompt);
  let res;
  const common = { cwd: cfg.app.cwd, timeoutMs: a.timeoutSec * 1000, onStdoutLine: onLine, env: { KANEGATE_PROMPT_FILE: promptFile } };
  if (a.command) {
    // Custom command: shell string; {promptFile} is substituted, KANEGATE_PROMPT_FILE is exported.
    res = await run(a.command.replaceAll('{promptFile}', JSON.stringify(promptFile)), [], { ...common, shell: true });
  } else {
    const make = PRESETS[a.preset];
    if (!make) throw new Error(`Unknown agent preset "${a.preset}". Use one of: ${AGENT_PRESETS.join(', ')}, or set agent.command.`);
    const [cmd, args] = make(prompt, a);
    if (!which(cmd)) throw new Error(`Agent binary "${cmd}" not found on PATH.`);
    res = await run(cmd, args, common);
  }
  fs.writeFileSync(logFile, `exit=${res.code}${res.timedOut ? ' (timed out)' : ''}\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}`);
  return res;
}
