#!/usr/bin/env node
/**
 * Set NOTION_API_KEY on the Vercel project (naver-trend).
 * Usage:
 *   VERCEL_TOKEN=... NOTION_API_KEY=... node scripts/set-vercel-notion-env.mjs
 * Optional:
 *   VERCEL_PROJECT_ID / VERCEL_PROJECT_NAME / VERCEL_TEAM_ID
 */
const TOKEN = process.env.VERCEL_TOKEN;
const NOTION = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
const PROJECT_NAME = process.env.VERCEL_PROJECT_NAME || 'naver-trend';
const TEAM_ID = process.env.VERCEL_TEAM_ID || '';

if (!TOKEN) {
  console.error('VERCEL_TOKEN missing. Create one at https://vercel.com/account/tokens');
  process.exit(1);
}
if (!NOTION) {
  console.error('NOTION_API_KEY missing');
  process.exit(1);
}

const api = async (path, init = {}) => {
  const url = new URL(`https://api.vercel.com${path}`);
  if (TEAM_ID) url.searchParams.set('teamId', TEAM_ID);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`${init.method || 'GET'} ${path} → ${res.status}`);
    err.body = body;
    throw err;
  }
  return body;
};

const projects = await api(`/v9/projects?search=${encodeURIComponent(PROJECT_NAME)}&limit=20`);
const project =
  (projects.projects || []).find((p) => p.name === PROJECT_NAME) ||
  (projects.projects || [])[0];
if (!project) {
  console.error('Project not found. Set VERCEL_PROJECT_NAME / VERCEL_TEAM_ID.');
  console.error(projects);
  process.exit(1);
}

console.log(`Using project ${project.name} (${project.id})`);

const existing = await api(`/v9/projects/${project.id}/env`);
const targets = ['production', 'preview', 'development'];
const upsert = async (key, value) => {
  const found = (existing.envs || []).find((e) => e.key === key);
  if (found) {
    await api(`/v9/projects/${project.id}/env/${found.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ value, target: targets, type: 'encrypted' }),
    });
    console.log(`updated ${key}`);
  } else {
    await api(`/v9/projects/${project.id}/env`, {
      method: 'POST',
      body: JSON.stringify({ key, value, target: targets, type: 'encrypted' }),
    });
    console.log(`created ${key}`);
  }
};

await upsert('NOTION_API_KEY', NOTION);
await upsert('NOTION_TOKEN', NOTION);

// Trigger redeploy of latest production deployment
const deps = await api(`/v6/deployments?projectId=${project.id}&target=production&limit=1`);
const latest = (deps.deployments || [])[0];
if (latest) {
  const redeploy = await api(`/v13/deployments`, {
    method: 'POST',
    body: JSON.stringify({
      name: project.name,
      deploymentId: latest.uid,
      meta: { action: 'redeploy-notion-env' },
    }),
  });
  console.log(`redeploy: ${redeploy.url || redeploy.id || 'queued'}`);
} else {
  console.log('No production deployment found to redeploy');
}

console.log('Done. Probe: https://naver-trend-two.vercel.app/api/portfolio-notion');
