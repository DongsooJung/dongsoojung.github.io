// Vercel project settings: Root Directory=private-gateway and
// "Include source files outside of the Root Directory in the Build Step"=on.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublicFile, publicFiles } from '../scripts/build-vercel-static.mjs';

const gateway = dirname(fileURLToPath(import.meta.url));
const root = resolve(gateway, '..');
const output = join(gateway, 'public');

export function selectPublicFiles(repoRoot) {
  // Vercel may package source without .git. Both paths use the same denylist.
  return existsSync(join(repoRoot, '.git'))
    ? execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' }).split('\0').filter(isPublicFile)
    : publicFiles(repoRoot);
}

export function stagePublicFiles() {
  const files = selectPublicFiles(root);
  if (!files.includes('index.html') || !files.includes('strategy/index.html')) throw new Error('Public site source is incomplete');
  const stubPath = 'strategy/monetization-opportunities/index.html';
  if (!files.includes(stubPath)) throw new Error('Private page login stub is missing');
  const stub = readFileSync(join(root, stubPath), 'utf8');
  if (Buffer.byteLength(stub) > 16000 || !stub.includes('https://stargate-private-gateway.vercel.app/api/private-monetization')) {
    throw new Error('Private page source is not the expected public login stub');
  }
  if (lstatIfPresent(output)?.isSymbolicLink()) throw new Error('Refusing symlinked gateway output');
  // output is a fixed path inside private-gateway; never accept a caller path.
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const path of files) {
    const source = resolve(root, path);
    if (!source.startsWith(root + sep)) throw new Error('Source path escapes repository');
    const stat = lstatSync(source);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Non-regular public file: ${path}`);
    const target = join(output, path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  return files.length;
}

function lstatIfPresent(path) {
  try { return lstatSync(path); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`Staged ${stagePublicFiles()} tracked public files for private gateway.`);
}
