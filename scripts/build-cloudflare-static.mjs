// Use the existing public-file safeguards, without Vercel-specific rewrites.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStatic, isPublicFile } from './build-vercel-static.mjs';

// These files are omitted by Vercel staging because it rewrites them upstream.
const snapshots = new Set(['research/airport-congestion/data/latest.json', 'naver-cafe-research/data/latest.json']);
const sourceTrees = new Set(['api', 'server', 'scripts', 'tests', 'test', 'app', 'automation', 'docs', 'ops', 'private-gateway', 'onbid-api', 'real-estate-api', 'quote-maker-app']);
const assetExtensions = new Set(['.html', '.css', '.js', '.json', '.geojson', '.csv', '.xlsx', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.mp3', '.mp4', '.woff', '.woff2', '.ttf', '.txt', '.xml', '.webmanifest']);

export function isCloudflarePublicFile(path) {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/');
  return (isPublicFile(normalized) || snapshots.has(normalized))
    && !parts.some(part => sourceTrees.has(part))
    && !['package.json', 'package-lock.json', 'vercel.json'].includes(parts.at(-1))
    && !/\.(test|spec)\.js$/.test(normalized)
    && assetExtensions.has(extname(normalized).toLowerCase());
}

export function buildCloudflareStatic(root, trackedFiles) {
  if (!existsSync(join(root, '.nojekyll'))) throw new Error('Expected the unprocessed .nojekyll static site');
  const files = trackedFiles.filter(isCloudflarePublicFile);
  let count = buildStatic(root, files);
  for (const path of files.filter(path => snapshots.has(path))) {
    let stat;
    try { stat = lstatSync(join(root, path)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    if (!stat.isFile()) throw new Error(`Non-regular public snapshot: ${path}`);
    const target = join(root, '.site-public', path);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(root, path), target);
    count++;
  }
  return count;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  console.log(`Staged ${buildCloudflareStatic(root, files)} tracked static assets for Cloudflare Workers.`);
}
