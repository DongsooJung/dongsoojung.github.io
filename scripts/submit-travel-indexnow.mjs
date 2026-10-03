// Run after publication. The IndexNow key is deliberately a public verification file.
import { readFile } from 'node:fs/promises';
const payload = JSON.parse(await readFile(new URL('./travel-indexnow.json', import.meta.url), 'utf8'));
const keyResponse = await fetch(payload.keyLocation, { signal: AbortSignal.timeout(20000) });
if (!keyResponse.ok || (await keyResponse.text()).trim() !== payload.key) {
  throw new Error('Publish the IndexNow verification file before submitting URLs.');
}
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(payload), signal: AbortSignal.timeout(20000)
});
if (![200, 202].includes(response.status)) throw new Error(`IndexNow returned HTTP ${response.status}`);
console.log(`IndexNow received ${payload.urlList.length} URLs (HTTP ${response.status}); indexing is not guaranteed.`);
