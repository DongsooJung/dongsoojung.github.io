const { existsSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');
const marker = path.join(root, 'node_modules', 'electron', 'package.json');
if (existsSync(marker)) process.exit(0);

const result = spawnSync('npm', ['install'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status === null ? 1 : result.status);
