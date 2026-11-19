import fs from 'node:fs';
import path from 'node:path';

export function writeReport(runDir, summary) {
  fs.writeFileSync(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
  const L = [];
  const verdict = summary.deployed ? '✅ DEPLOYED — Kane signed off' : summary.outcome === 'error' ? '⚠️ GATE ERROR — Kane could not run' : summary.outcome === 'dry-run' ? '✅ GREEN — deploy skipped (--dry-run / check)' : '⛔ DEPLOY BLOCKED — Kane did not sign off';
  L.push(`# kanegate run ${summary.runId}`, '', `**${verdict}**`, '');
  L.push(`- App: ${summary.appUrl}`, `- Agent: ${summary.agent}`, `- Kane CLI: ${summary.kaneVersion || 'unknown'}`, `- Attempts: ${summary.iterations.length} / ${summary.maxIterations}`, `- Started: ${summary.startedAt}`, `- Finished: ${summary.finishedAt}`, '');
  for (const it of summary.iterations) {
    L.push(`## Attempt ${it.iteration}`, '', '| Flow | Kane verdict | Reason | Steps | Duration |', '|---|---|---|---|---|');
    for (const r of it.results) {
      L.push(`| ${r.flow} | ${r.status === 'passed' ? '✅ passed' : r.status === 'failed' ? '❌ failed' : '⚠️ error'} | ${(r.reason || r.summary || '').replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200)} | ${r.steps?.length ?? 0} | ${r.duration != null ? r.duration + 's' : ''} |`);
    }
    for (const r of it.results) if (r.testUrl) L.push(`- ${r.flow}: [Kane test link](${r.testUrl})`);
    if (it.agent) {
      L.push('', `**Fed back to agent:** [prompt](${it.agent.promptFile}) → exit ${it.agent.exitCode}; files changed: ${it.agent.files?.length ? it.agent.files.map((f) => '`' + f + '`').join(', ') : 'none'}${it.agent.tampered?.length ? ` · ⚠️ reverted edits to protected files: ${it.agent.tampered.join(', ')}` : ''}`);
      if (it.agent.reply) L.push('', '> ' + it.agent.reply.trim().split('\n').slice(-6).join('\n> '));
    }
    L.push('');
  }
  if (summary.deploy) L.push('## Deploy', '', `\`${summary.deploy.command}\` → exit ${summary.deploy.exitCode}`, '', '```', (summary.deploy.output || '').trim().slice(-1500), '```');
  fs.writeFileSync(path.join(runDir, 'REPORT.md'), L.join('\n') + '\n');
}
