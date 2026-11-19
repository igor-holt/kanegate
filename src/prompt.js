import path from 'node:path';

/** Turn Kane's verdicts into a re-prompt for the coding agent. */
export function buildFixPrompt(cfg, failures, { iteration, maxIterations, history = [] }) {
  const L = [];
  L.push(`# Kane CLI blocked this deploy (attempt ${iteration} of ${maxIterations})`);
  L.push('');
  L.push(`Kane CLI just ran the app's user flows in a real Chrome browser against ${cfg.app.url}. ${failures.length} flow(s) failed. The deploy is blocked until every flow passes.`);
  L.push('');
  L.push('## Your job');
  L.push('Fix the application code in this repository so the failing flows below pass in a real browser.');
  L.push('- Change the product, not the test. Do NOT edit ' + cfg.protect.map((p) => '`' + p + '`').join(', ') + ' or weaken any flow. Edits to protected files are reverted automatically.');
  L.push('- Keep the fix minimal and focused on the behaviour Kane reported.');
  L.push('- Do not start or deploy the app; kanegate restarts it and re-runs Kane after you finish.');
  L.push('');
  for (const f of failures) {
    L.push(`## Failed flow: \`${f.flow}\``);
    L.push('');
    L.push('**Objective Kane executed (plain English):**');
    L.push('> ' + f.objective.replace(/\n/g, '\n> '));
    L.push('');
    if (f.reason) L.push(`**Kane's failure reason:** ${f.reason}`);
    if (f.summary) L.push(`**Kane's summary:** ${f.summary}`);
    if (f.finalState && Object.keys(f.finalState).length) L.push('**Values Kane extracted:** `' + JSON.stringify(f.finalState) + '`');
    if (f.steps?.length) {
      L.push('', '**Steps Kane took:**');
      for (const s of f.steps) L.push(`- step ${s.step ?? '?'} [${s.status || '?'}] ${s.remark}`);
    }
    const ev = f.evidence;
    if (ev?.failure) L.push('', '**Evidence pack failure.yaml:**', '```yaml', ev.failure.trim(), '```');
    for (const sf of ev?.stepFailures || []) L.push('', `**${sf.entry}:**`, '```yaml', sf.body.trim(), '```');
    if (ev?.consoleErrors?.length) L.push('', '**Browser console errors during the run:**', '```', ...ev.consoleErrors, '```');
    if (ev?.screenshot) L.push('', `Screenshot of the page at failure: \`${path.relative(cfg.root, ev.screenshot)}\``);
    if (ev?.pack) L.push(`Full evidence pack (zip): \`${path.relative(cfg.root, ev.pack)}\``);
    L.push('');
  }
  if (history.length) {
    L.push('## Earlier attempts in this run');
    for (const h of history) L.push(`- attempt ${h.iteration}: ${h.failed.join(', ') || 'none'} failed${h.changed ? `; you changed ${h.changed}` : ''}`);
    L.push('Those changes did not make every flow pass. Re-read the failure above before editing.');
    L.push('');
  }
  L.push('When you are done, reply with one short paragraph naming the root cause and the file(s) you changed.');
  return L.join('\n');
}
