import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../assets/developer-log-snapshot.json', import.meta.url));
const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const raw = execFileSync('git', [
  'log', 'HEAD', `--since=${since}`, '--format=%H%x1f%cI%x1f%s%x1e'
], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

const commits = raw.split('\x1e').map(record => {
  const [sha, date, message] = record.trim().split('\x1f');
  return sha && date ? { sha, date, message: message || '' } : null;
}).filter(commit => commit && !commit.message.includes('[devlog-data]'));

writeFileSync(output, JSON.stringify({ generated_at: new Date().toISOString(), commits }) + '\n');
console.log(`Saved ${commits.length} commits to ${output}`);
