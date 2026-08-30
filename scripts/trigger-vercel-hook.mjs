import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function triggerDeployHook(hook, request = fetch) {
  let url;
  try { url = new URL(hook); } catch { throw new Error('VERCEL_DEPLOY_HOOK_URL is missing or invalid'); }
  if (url.origin !== 'https://api.vercel.com' || url.username || url.password || url.search || url.hash
    || !/^\/v1\/integrations\/deploy\/prj_bfalcR6646HRzJ7BYvmaBXqIuQt9\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    throw new Error('Deploy Hook must belong to the configured portfolio project');
  }
  // No automatic retries: an uncertain response may already have queued a build.
  let response;
  try { response = await request(url.href, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('Deploy Hook request failed; check Vercel before retrying'); }
  if (!response.ok) throw new Error(`Deploy Hook rejected (HTTP ${response.status})`);
  let payload;
  try { payload = await response.json(); } catch { throw new Error('Deploy Hook returned invalid JSON'); }
  if (!/^[A-Za-z0-9_-]+$/.test(payload?.job?.id || '') || !['PENDING', 'RUNNING', 'SUCCESS'].includes(payload?.job?.state)) {
    throw new Error('Deploy Hook did not acknowledge a valid deployment job');
  }
  return { id: payload.job.id, state: payload.job.state };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const job = await triggerDeployHook(process.env.VERCEL_DEPLOY_HOOK_URL);
    console.log(`Vercel job ${job.id}: ${job.state}. Request accepted; verify deployment READY separately.`);
  } catch (error) {
    // Do not emit fetch errors/stacks or response bodies: they can echo the secret URL.
    console.error(error.message);
    process.exitCode = 1;
  }
}
