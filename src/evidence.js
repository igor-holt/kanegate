import fs from 'node:fs';
import path from 'node:path';
import { run, truncate } from './util.js';

/**
 * A Kane evidence pack is a zip: run.yaml, failure.yaml, tests/<id>/{result.yaml, steps/<n>/{screenshot.png, failure.yaml}, logs/<n>-console.ndjson}.
 * Pull out the parts a coding agent can act on, and copy the pack + failing screenshot next to the run.
 */
export async function readEvidence(packPath, outDir, flowName) {
  const out = { pack: null, failure: null, stepFailures: [], consoleErrors: [], screenshot: null };
  try {
    const dest = path.join(outDir, `${flowName}.evidence`);
    fs.copyFileSync(packPath, dest);
    out.pack = dest;
    const list = await run('unzip', ['-Z1', dest]);
    if (list.code !== 0) return out;
    const entries = list.stdout.split('\n').filter(Boolean);
    const cat = async (e) => (await run('unzip', ['-p', dest, e])).stdout;

    if (entries.includes('failure.yaml')) out.failure = truncate(await cat('failure.yaml'), 3000);
    for (const e of entries.filter((x) => /\/steps\/[^/]+\/failure\.yaml$/.test(x)).slice(0, 5)) {
      out.stepFailures.push({ entry: e, body: truncate(await cat(e), 2000) });
    }
    for (const e of entries.filter((x) => /-console\.ndjson$/.test(x))) {
      for (const line of (await cat(e)).split('\n')) {
        if (/"(level|type)"\s*:\s*"(error|severe|exception)"/i.test(line)) out.consoleErrors.push(truncate(line, 400));
      }
    }
    out.consoleErrors = out.consoleErrors.slice(0, 15);
    // Screenshot of the first failing step, else the last step.
    const failedDir = out.stepFailures[0]?.entry.replace(/failure\.yaml$/, '');
    const shots = entries.filter((x) => /\/steps\/[^/]+\/screenshot\.(png|jpe?g)$/.test(x)).sort();
    const shot = (failedDir && shots.find((s) => s.startsWith(failedDir))) || shots[shots.length - 1];
    if (shot) {
      const png = path.join(outDir, `${flowName}.failure${path.extname(shot)}`);
      const r = await run('sh', ['-c', 'unzip -p "$1" "$2" > "$3"', 'sh', dest, shot, png]);
      if (r.code === 0) out.screenshot = png;
    }
  } catch (e) {
    out.error = String(e.message || e);
  }
  return out;
}
