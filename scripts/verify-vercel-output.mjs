import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '.vercel', 'output');
function listFunctions(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return [];
    const next = join(path, entry.name);
    return entry.name.endsWith('.func') ? [next] : listFunctions(next);
  });
}
const functions = listFunctions(join(output, 'functions'));
assert.ok(functions.length > 0 && functions.length <= 12, `Hobby function budget exceeded: ${functions.length}/12`);
const routes = JSON.parse(readFileSync(join(output, 'config.json'), 'utf8')).routes;
for (const path of ['/viz-dashboard', '/viz-dashboard/', '/viz-dashboard/example']) {
  const redirect = routes.find(route => route.status === 301 && new RegExp(route.src).test(path));
  assert.equal(redirect?.headers?.Location, '/choropleth/', `301 missing for ${path}`);
}
for (const path of ['index.html', 'research/index.html', 'research/urban-atlas/index.html', 'research/accessibility-lab/index.html', 'choropleth/index.html']) {
  assert.ok(existsSync(join(output, 'static', path)), `Static page missing: ${path}`);
}
for (const path of ['server', 'supabase', '.env', '.env.local', '.github']) {
  assert.ok(!existsSync(join(output, 'static', path)), `Private source exposed: ${path}`);
}
for (const path of ['research/airport-congestion/data/latest.json', 'naver-cafe-research/data/latest.json']) {
  assert.ok(!existsSync(join(output, 'static', path)), `Bundled snapshot shadows live proxy: ${path}`);
  assert.ok(routes.some(route => route.dest === `https://raw.githubusercontent.com/DongsooJung/dongsoojung.github.io/main/${path}`), `Live snapshot proxy missing: ${path}`);
}
console.log(`Verified Vercel artifact: ${functions.length}/12 functions, exact HTTP 301, static hubs and private-file exclusions.`);
