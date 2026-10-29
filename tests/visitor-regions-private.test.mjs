import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('regional endpoint is only exposed after existing Access authentication',()=>{
 const routes=read('cloudflare/routes.mjs');
 const publicMethods=routes.split('\n').find(line=>line.startsWith('const publicMethods'));
 const adminMethods=routes.split('\n').find(line=>line.startsWith('const adminMethods'));
 assert.ok(!publicMethods.includes('get_site_region_stats'));
 assert.ok(adminMethods.includes('get_site_region_stats'));
 assert.ok(routes.indexOf('verifyAccessRequest(request,env,options.access)')<routes.indexOf('if (!adminMethods.has(method))'));
 const homepage=read('index.html');assert.ok(!homepage.includes('data-visitor-regions'));assert.ok(!homepage.includes('visitor-regions.js'));
 assert.match(read('admin/visitors/index.html'),/data-visitor-regions/);
});
