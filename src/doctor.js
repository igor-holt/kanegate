import { run, which, log, color } from './util.js';
import { kaneCredentials } from './kane.js';
import { agentBinary, agentLabel } from './agent.js';

export async function doctor(cfg) {
  let ok = true;
  const line = (good, label, detail = '') => { if (good === false) ok = false; log(`${good === true ? color.green('✓') : good === false ? color.red('✗') : color.yellow('!')} ${label}${detail ? color.dim('  ' + detail) : ''}`); };
  const kaneBin = process.env.KANEGATE_KANE_BIN || cfg?.kane.bin || 'kane-cli';
  const v = await run(kaneBin, ['--version']);
  line(v.code === 0, 'kane-cli installed', v.code === 0 ? v.stdout.trim() : 'npm install -g @testmuai/kane-cli');
  const creds = kaneCredentials();
  if (creds) line(true, 'Kane credentials from env', 'KANE_USERNAME / KANE_ACCESS_KEY set (value hidden)');
  else {
    const w = await run(kaneBin, ['whoami'], { timeoutMs: 20000 });
    const logged = w.code === 0 && !/not logged in/i.test(w.stdout + w.stderr);
    line(logged, 'Kane authenticated', logged ? 'stored kane-cli login' : 'set KANE_USERNAME + KANE_ACCESS_KEY, or run `kane-cli login`');
  }
  const chrome = process.env.KANE_CLI_CHROME_PATH || which('google-chrome') || which('google-chrome-stable') || (process.platform === 'darwin' ? '/Applications/Google Chrome.app' : null);
  line(!!chrome, 'Google Chrome found', chrome || 'install Chrome stable or set KANE_CLI_CHROME_PATH');
  if (cfg) {
    const bin = agentBinary(cfg.agent);
    if (bin) line(!!which(bin), `agent "${agentLabel(cfg.agent)}" on PATH`, which(bin) || `install ${bin}`);
    else line(null, 'agent', agentLabel(cfg.agent));
    line(true, `config ${cfg.file}`, `${cfg.flows.length} flow(s), deploy: ${cfg.deploy.command || 'none'}`);
  } else line(null, 'no kanegate.config.json here', 'run `kanegate init`');
  return ok;
}
