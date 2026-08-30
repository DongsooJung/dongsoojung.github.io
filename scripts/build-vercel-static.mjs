// Stage public files separately from server implementations and credentials.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const privateRoots = new Set(['api', 'server', 'scripts', 'tests', 'supabase', '.github', '.git', '.vercel', '.site-public', 'node_modules']);
const privateFiles = new Set(['vercel.json', 'package.json', 'package-lock.json', 'AGENTS.md']);
// A bundled file would win Vercel's filesystem route before external rewrites.
const liveSnapshots = new Set(['research/airport-congestion/data/latest.json', 'naver-cafe-research/data/latest.json']);

export function isPublicFile(path) {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/');
  return parts.length > 0 && !parts.some(part => !part || part === '..' || part === '.' || part.startsWith('.env'))
    && !privateRoots.has(parts[0]) && !privateFiles.has(parts.at(-1)) && !liveSnapshots.has(normalized)
    && !parts.includes('node_modules') && !/\.(pem|key|keystore|jks)$/i.test(path)
    && !parts.some(part => part.startsWith('.') && part !== '.well-known' && part !== '.nojekyll');
}

export function publicFiles(root, prefix = '') {
  // Vercel source archives need not include .git. Do not traverse private trees.
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (!isPublicFile(path)) return [];
    if (entry.isSymbolicLink()) throw new Error(`Symlink in public tree: ${path}`);
    return entry.isDirectory() ? publicFiles(root, path) : [path];
  });
}

export function buildStatic(root, files) {
  const base = resolve(root);
  const output = join(base, '.site-public');
  // Only this generated directory may be cleared; never follow a user symlink.
  try { if (lstatSync(output).isSymbolicLink()) throw new Error('Refusing a symlinked build output'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  let count = 0;
  for (const path of new Set(files.filter(isPublicFile))) {
    const source = resolve(base, path);
    if (!source.startsWith(base + sep)) throw new Error('File outside repository');
    let stat;
    try { stat = lstatSync(source); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Non-regular public file: ${path}`);
    const target = join(output, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
    count++;
  }
  return count;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = existsSync(join(root, '.git'))
    ? execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)
    : publicFiles(root);
  console.log(`Staged ${buildStatic(root, files)} public files (server code and secrets excluded).`);
}
