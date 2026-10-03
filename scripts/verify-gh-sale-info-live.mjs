// The custom domain is static; its GH dashboard uses this deployed API.
const endpoint = 'https://portfolio-stargate2.vercel.app/api/gh-sale-info';
const version = '2026-10-03-data-attributes';
const waitForDeployment = process.env.GH_WAIT_FOR_DEPLOYMENT === '1';

async function request(suffix = '', options = {}) {
  const response = await fetch(endpoint + suffix, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers },
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`GH HTTP ${response.status}: ${data.error || 'request failed'}`);
  return data;
}

let ready = false;
for (let attempt = 0; attempt < (waitForDeployment ? 16 : 1); attempt += 1) {
  const status = await request('?limit=1&logLimit=1');
  if (status.collectorVersion === version) { ready = true; break; }
  if (waitForDeployment) await new Promise(resolve => setTimeout(resolve, 15_000));
}
if (!ready) throw new Error('GH collector deployment is not ready; collection was not requested.');

const collected = await request('', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
});
if (!(collected.saved > 0) || !collected.logId) throw new Error('GH collection or log storage returned no records.');
const readback = await request('?limit=200&logLimit=5');
const keys = new Set(readback.saved.map(row => `${row.source_type}:${row.pbanc_no}`));
if (!collected.items.every(row => keys.has(`${row.source_type}:${row.pbanc_no}`))) {
  throw new Error('Some collected GH notices are missing from Supabase readback.');
}
const log = readback.logs.find(row => row.id === collected.logId);
if (!log || log.status !== 'ok' || log.saved_count !== collected.saved) {
  throw new Error('GH success log could not be verified.');
}
console.log(JSON.stringify({ saved: collected.saved, logId: collected.logId, sources: collected.sourceStatus }));
if (!collected.sourceStatus.every(source => source.ok)) {
  throw new Error('GH partially collected: one or more official categories failed.');
}
