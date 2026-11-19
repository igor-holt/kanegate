import fs from 'node:fs';
import path from 'node:path';

export function init(cwd) {
  const file = path.join(cwd, 'kanegate.config.json');
  if (fs.existsSync(file)) throw new Error(`${file} already exists.`);
  const cfg = {
    $schema: 'https://raw.githubusercontent.com/igor-holt/kanegate/main/schema.json',
    maxIterations: 4,
    app: { start: 'npm start', url: 'http://localhost:3000', readyTimeoutSec: 30 },
    flows: [
      { name: 'home-loads', objective: 'Open the home page and verify the main heading is visible and the page shows no error message.' },
    ],
    agent: { preset: 'opencode' },
    deploy: { command: 'echo "replace me with your deploy command, e.g. npx vercel deploy --prod"' },
  };
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
  return file;
}
