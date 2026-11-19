// Demo "deploy": publish public/ to dist/ and stamp it with the Kane sign-off.
// Swap this for your real deploy (e.g. `npx vercel deploy --prod`) in kanegate.config.json.
import fs from 'node:fs';
import { execSync } from 'node:child_process';

fs.rmSync('dist', { recursive: true, force: true });
fs.cpSync('public', 'dist', { recursive: true });
let commit = null;
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
const stamp = {
  deployedAt: new Date().toISOString(),
  commit,
  kanegateRun: process.env.KANEGATE_RUN_ID || null,
  kaneFlowsPassed: (process.env.KANEGATE_FLOWS_PASSED || '').split(',').filter(Boolean),
};
fs.writeFileSync('dist/DEPLOYED.json', JSON.stringify(stamp, null, 2));
console.log(`published ${fs.readdirSync('dist').length} files to dist/ (run ${stamp.kanegateRun})`);
