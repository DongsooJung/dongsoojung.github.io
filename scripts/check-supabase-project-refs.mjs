import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const LEGACY_REF = 'flxntafmvcdhpagzrvii';
const ALLOWED_LEGACY_PATHS = new Set([
  'execution/kpi-sync.js',
  'cardnews/index.html',
  'cardnews/admin/index.html',
  'supabase/PROJECT_REGISTRY.md',
]);
const SKIP_DIRS = new Set(['.git', 'node_modules', '.site-public']);
const TEXT_EXTENSIONS = new Set([
  '.html', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.sql', '.yml', '.yaml', '.txt', '.env', '.example', '.py', '.css'
]);

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

const violations = [];
for await (const file of walk(ROOT)) {
  const ext = path.extname(file).toLowerCase();
  const base = path.basename(file);
  if (!TEXT_EXTENSIONS.has(ext) && !base.startsWith('.env')) continue;

  let content;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch {
    continue;
  }
  if (!content.includes(LEGACY_REF)) continue;

  const relative = path.relative(ROOT, file).split(path.sep).join('/');
  if (!ALLOWED_LEGACY_PATHS.has(relative)) violations.push(relative);
}

if (violations.length) {
  console.error('Legacy Supabase project reference found outside the migration allowlist:');
  for (const file of violations) console.error(` - ${file}`);
  console.error('Use canonical production project inftexpcnfinglwlrvsj for new code.');
  process.exit(1);
}

console.log('Supabase project-ref guard passed. No new legacy references detected.');
