import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for the 2026-11-17 incident (#298): shell variables in the
// data-push retry loop were lost, leaving `git pull --rebase origin ""`,
// `git push origin "HEAD:"` and `[ "" = 5 ]`. Every push failed, the loop fell
// through and the step still exited 0, so 18 data workflows reported success
// while publishing nothing.
const workflowDir = join(fileURLToPath(new URL('..', import.meta.url)), '.github', 'workflows');
const workflows = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, lines: readFileSync(join(workflowDir, name), 'utf8').split('\n') }));

const rules = [
  { label: 'git command with an empty-string argument', pattern: /\bgit\s+(pull|push|fetch|rebase|checkout|switch)\b[^#\n]*\s""(\s|;|&|$)/ },
  { label: 'git push with an empty destination ref', pattern: /\bgit\s+push\b[^#\n]*["'\s][^\s"']*:["'](\s|;|&|$)/ },
  { label: 'test that compares an empty literal', pattern: /\[\s+""\s+(=|==|!=|-eq|-ne|-lt|-gt)\s/ },
];

test('workflow shell steps keep their variables in git and test commands', () => {
  assert.ok(workflows.length > 0, 'no workflow files found');
  const problems = [];
  for (const { name, lines } of workflows) {
    lines.forEach((line, index) => {
      for (const { label, pattern } of rules) {
        if (pattern.test(line)) problems.push(`${name}:${index + 1} ${label}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

test('data-push retry loops fail the step when every attempt fails', () => {
  for (const { name, lines } of workflows) {
    const text = lines.join('\n');
    const loops = text.match(/for attempt in 1 2 3 4 5; do[\s\S]*?\n\s*done/g) || [];
    for (const loop of loops) {
      if (!/git push/.test(loop)) continue;
      assert.match(loop, /\[\s+"\$attempt"\s+=\s+5\s+\][\s\S]*exit 1/, `${name}: retry loop must exit 1 after the last attempt`);
      assert.match(loop, /git push origin "HEAD:\$branch"/, `${name}: retry loop must push to an explicit branch`);
    }
  }
});
