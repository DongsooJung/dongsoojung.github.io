#!/usr/bin/env node
// stargatelearn.com 라이브 콘텐츠 보강 적용기.
//
//   node apply-page-updates.mjs --manifest page-updates/<name>.mjs [--out ./out] [--dry-run]
//   node apply-page-updates.mjs --rollback out/page-updates-backup-<date>.json
//
// 이미 게시된 페이지·글의 본문에 구간을 추가한다(구독 폼 · 내부 링크 · 본문 보강).
// 자격증명은 환경변수(WP_SITE / WP_USER / WP_APP_PASSWORD)로만 받는다.
// 원본 본문은 out/ 에 백업하고 --rollback 으로 되돌릴 수 있다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// 구독 블록은 원본 페이지에서 그대로 복사한다(직접 만들면 서버 렌더 블록이 깨진다).
export const SUBSCRIBE_PLACEHOLDER = '{{SUBSCRIBE}}';

// 블록 하나가 이보다 크면 "전체 본문이 한 덩어리" 라고 보고 텍스트 위치에 삽입한다.
const MAX_INLINE_SPAN = 4000;

const DANGEROUS = [/<script\b/i, /<iframe\b/i, /javascript:/i, /\son[a-z]+\s*=/i];

export function validateBlocks(blocks) {
  const text = String(blocks ?? '');
  if (!text.trim()) throw new Error('추가할 블록이 비어 있습니다');
  for (const pattern of DANGEROUS) {
    if (pattern.test(text)) throw new Error(`안전하지 않은 블록이 들어 있습니다: ${pattern}`);
  }
  return text;
}

// 구독 블록을 원본 raw 에서 그대로 잘라 낸다.
export function extractSubscriptionsBlock(raw) {
  const text = String(raw ?? '');
  const marker = text.indexOf('wp:jetpack/subscriptions');
  if (marker < 0) return null;
  const openStart = text.lastIndexOf('<!--', marker);
  if (openStart < 0) return null;
  const closeTag = '<!-- /wp:jetpack/subscriptions -->';
  const closeIdx = text.indexOf(closeTag, marker);
  if (closeIdx >= 0) return text.slice(openStart, closeIdx + closeTag.length);
  const selfClose = text.indexOf('/-->', marker);
  if (selfClose >= 0 && selfClose - marker < 400) return text.slice(openStart, selfClose + 4);
  return null;
}

// needle 을 포함하는 블록의 시작·끝을 찾는다.
export function findBlockSpan(raw, needle) {
  const text = String(raw ?? '');
  const idx = text.indexOf(needle);
  if (idx < 0) return null;
  const openIdx = text.lastIndexOf('<!-- wp:', idx);
  const closeIdx = text.indexOf('-->', idx);
  if (openIdx >= 0 && closeIdx >= 0 && closeIdx - openIdx < 200000) {
    return { start: openIdx, end: closeIdx + 3, textIndex: idx, form: 'block', length: closeIdx + 3 - openIdx };
  }
  const tagStart = text.lastIndexOf('<', idx);
  // 여는 태그의 '>' 를 먼저 찾는다(needle 뒤의 첫 '>' 는 닫는 태그일 수 있다).
  const openEnd = tagStart >= 0 ? text.indexOf('>', tagStart) : -1;
  if (tagStart >= 0 && openEnd >= 0 && openEnd < idx) {
    const nameMatch = text.slice(tagStart + 1).match(/^([a-z0-9]+)/i);
    const name = nameMatch ? nameMatch[1].toLowerCase() : 'p';
    const closeTag = `</${name}>`;
    const close = text.indexOf(closeTag, openEnd);
    if (close >= 0) {
      const end = close + closeTag.length;
      return { start: tagStart, end, textIndex: idx, form: 'tag', length: end - tagStart };
    }
  }
  return { start: idx, end: idx, textIndex: idx, form: 'text', length: 0 };
}

export function resolveBlocks(blocks, subscribeBlock) {
  const text = validateBlocks(blocks);
  if (!text.includes(SUBSCRIBE_PLACEHOLDER)) return text;
  if (!subscribeBlock) throw new Error('구독 블록을 찾지 못했습니다.');
  return text.split(SUBSCRIBE_PLACEHOLDER).join(subscribeBlock);
}

// 블록 단위 교체가 불가능할 때(본문 전체가 한 덩어리) 텍스트 위치에 삽입한다.
// markerBase 가 있으면 작업마다 고유 표식(HTML 주석)을 남긴다.
// → 다음 실행 때 이미 반영된 작업은 건너뛴다(부분 반영 상태도 이어서 완료된다).
export function applyOperations(raw, operations, subscribeBlock, { markerBase = '' } = {}) {
  let content = String(raw ?? '');
  const applied = [];
  for (const [index, op] of (operations ?? []).entries()) {
    const opMarker = markerBase ? `sl-update:${markerBase}:${index}` : '';
    if (opMarker && content.includes(opMarker)) {
      applied.push({ op: op.op, skipped: 'already-applied' });
      continue;
    }
    const marker = opMarker ? `\n\n<!-- ${opMarker} -->` : '';
    const blocks = resolveBlocks(op.blocks, subscribeBlock) + marker;
    if (op.op === 'append') {
      content = content.replace(/\s+$/, '') + '\n\n' + blocks + '\n';
      applied.push({ op: 'append' });
      continue;
    }
    if (op.op === 'insertBefore' || op.op === 'replace') {
      const span = findBlockSpan(content, op.match);
      if (!span) throw new Error(`${op.op} 대상을 찾지 못했습니다: ${op.match}`);
      if (span.form === 'text') throw new Error(`${op.op} 대상의 블록 구조를 알 수 없습니다: ${op.match}`);
      if (span.length > MAX_INLINE_SPAN) {
        // 전체 본문이 하나의 블록이다. 텍스트 위치에 삽입하면 그대로 렌더된다.
        const at = span.textIndex;
        content = content.slice(0, at) + blocks + '\n\n' + content.slice(at);
        applied.push({ op: op.op, fallback: 'text-insert', match: op.match });
        continue;
      }
      if (op.op === 'insertBefore') {
        content = content.slice(0, span.start) + blocks + '\n\n' + content.slice(span.start);
        applied.push({ op: 'insertBefore', match: op.match });
      } else {
        content = content.slice(0, span.start) + blocks + content.slice(span.end);
        applied.push({ op: 'replace', match: op.match });
      }
      continue;
    }
    throw new Error(`알 수 없는 작업: ${op.op}`);
  }
  return { content, applied };
}

// 대상의 모든 작업 표식이 이미 있으면 다시 적용하지 않는다.
export function isFullyApplied(raw, operations, markerBase) {
  if (!markerBase) return false;
  const text = String(raw ?? '');
  return (operations ?? []).every((_, index) => text.includes(`sl-update:${markerBase}:${index}`));
}

export function describeRaw(raw) {
  const text = String(raw ?? '');
  const openers = [...text.matchAll(/<!--\s*wp:([a-z0-9\/-]+)/gi)].map((m) => m[1]);
  const counts = {};
  for (const name of openers) counts[name] = (counts[name] ?? 0) + 1;
  return {
    length: text.length,
    blockTypes: counts,
    htmlBlockOnly: openers.length > 0 && openers.every((name) => name === 'html'),
  };
}

const norm = (value) => String(value ?? '').replace(/\r\n/g, '\n').trim();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function wpRequest(site, auth, restPath, { fetchImpl = fetch, ...init } = {}) {
  const res = await fetchImpl(`https://${site}/wp-json/wp/v2${restPath}`, {
    ...init,
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WordPress ${restPath} 실패: HTTP ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

export async function loadManifest(manifestPath) {
  const mod = await import(pathToFileURL(path.resolve(manifestPath)).href);
  const spec = mod.default ?? mod.manifest ?? mod;
  if (!spec || !Array.isArray(spec.updates)) throw new Error('매니페스트에 updates 배열이 없습니다.');
  return spec;
}

export async function runPageUpdates({
  manifestPath,
  out = path.join(HERE, 'out'),
  dryRun = false,
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const site = (process.env.WP_SITE || 'stargatelearn.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const user = process.env.WP_USER || '';
  const appPassword = (process.env.WP_APP_PASSWORD || '');
  if (!user || !appPassword) throw new Error('WP_USER / WP_APP_PASSWORD 가 없습니다.');
  const auth = 'Basic ' + Buffer.from(`${user}:${appPassword}`).toString('base64');
  const request = (restPath, init) => wpRequest(site, auth, restPath, { fetchImpl, ...init });

  const spec = await loadManifest(manifestPath);
  const stamp = spec.updatedAt ?? 'run';

  const source = spec.subscribeSource;
  let subscribeBlock = null;
  if (source) {
    const src = await request(`/${source.kind}/${source.id}?context=edit&_fields=id,content`);
    subscribeBlock = extractSubscriptionsBlock(src.content?.raw ?? '');
    if (!subscribeBlock) throw new Error(`구독 블록을 찾지 못했습니다 (${source.kind}/${source.id}).`);
  }

  const results = [];
  const backup = { savedAt: new Date().toISOString(), site, manifest: path.basename(manifestPath), items: [] };

  for (const update of spec.updates) {
    const current = await request(`/${update.kind}/${update.id}?context=edit&_fields=id,slug,status,title,content`);
    const raw = current.content?.raw ?? '';
    const markerBase = update.idempotencyMarker || '';
    if (isFullyApplied(raw, update.operations, markerBase)) {
      results.push({ label: update.label, id: update.id, status: 'skipped-already-applied' });
      log(`건너뜀(이미 적용됨): ${update.label}`);
      continue;
    }
    const { content, applied } = applyOperations(raw, update.operations, subscribeBlock, { markerBase });
    backup.items.push({ kind: update.kind, id: update.id, label: update.label, originalRaw: raw });
    const shape = describeRaw(raw);
    if (dryRun) {
      results.push({ label: update.label, id: update.id, status: 'dry-run', before: raw.length, after: content.length, applied, shape });
      log(`(dry-run) ${update.label}: ${raw.length}자 -> ${content.length}자`);
      continue;
    }
    const saved = await request(`/${update.kind}/${update.id}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    const verify = await request(`/${update.kind}/${update.id}?context=edit&_fields=id,content`);
    const ok = norm(verify.content?.raw) === norm(content);
    results.push({
      label: update.label,
      id: update.id,
      status: ok ? 'applied' : 'verify-mismatch',
      before: raw.length,
      after: norm(content).length,
      savedLength: norm(saved.content?.raw ?? '').length,
      applied,
      shape,
    });
    log(`${ok ? '반영됨' : '검증 불일치'}: ${update.label} (${raw.length}자 -> ${norm(content).length}자)`);
    await sleep(1500);
  }

  await fs.mkdir(out, { recursive: true });
  const backupFile = path.join(out, `page-updates-backup-${stamp}.json`);
  const resultFile = path.join(out, `page-updates-result-${stamp}.json`);
  if (!dryRun) await fs.writeFile(backupFile, JSON.stringify(backup, null, 2), 'utf8');
  await fs.writeFile(resultFile, JSON.stringify({ updatedAt: stamp, dryRun, results, backupFile: dryRun ? null : backupFile }, null, 2), 'utf8');

  return { updatedAt: stamp, dryRun, results, backupFile: dryRun ? null : backupFile, resultFile };
}

export async function rollback({ backupFile, fetchImpl = fetch, log = console.log } = {}) {
  const backup = JSON.parse(await fs.readFile(backupFile, 'utf8'));
  const site = (process.env.WP_SITE || backup.site || 'stargatelearn.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const user = process.env.WP_USER || '';
  const appPassword = (process.env.WP_APP_PASSWORD || '');
  if (!user || !appPassword) throw new Error('WP_USER / WP_APP_PASSWORD 가 없습니다.');
  const auth = 'Basic ' + Buffer.from(`${user}:${appPassword}`).toString('base64');
  const request = (restPath, init) => wpRequest(site, auth, restPath, { fetchImpl, ...init });
  const results = [];
  for (const item of backup.items ?? []) {
    await request(`/${item.kind}/${item.id}`, {
      method: 'POST',
      body: JSON.stringify({ content: item.originalRaw }),
    });
    const verify = await request(`/${item.kind}/${item.id}?context=edit&_fields=id,content`);
    const ok = norm(verify.content?.raw) === norm(item.originalRaw);
    results.push({ label: item.label, id: item.id, restored: ok });
    log(`${ok ? '복원됨' : '복원 검증 실패'}: ${item.label}`);
    await sleep(1200);
  }
  return { restored: results };
}

async function cli() {
  const argv = process.argv.slice(2);
  const value = (name, fallback = '') => {
    const index = argv.indexOf(name);
    return index >= 0 ? String(argv[index + 1] ?? '') : fallback;
  };
  const out = value('--out', path.join(HERE, 'out'));
  if (argv.includes('--rollback')) {
    const result = await rollback({ backupFile: path.resolve(value('--rollback')) });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const manifestPath = path.resolve(HERE, value('--manifest', 'page-updates/2026-11-23-return-path.mjs'));
  const result = await runPageUpdates({ manifestPath, out, dryRun: argv.includes('--dry-run') });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
