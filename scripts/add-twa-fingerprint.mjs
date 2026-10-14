// Add a SHA-256 signing-cert fingerprint to .well-known/assetlinks.json for the Stargate TWA.
//
//   node scripts/add-twa-fingerprint.mjs <SHA-256>   # add (colons/case/"SHA256:" prefix optional)
//   node scripts/add-twa-fingerprint.mjs --check     # verify the live site via Google's Digital Asset Links API
import fs from 'node:fs/promises';
import path from 'node:path';

const FILE = path.join(process.cwd(), '.well-known/assetlinks.json');
const PACKAGE = 'kr.co.stargateedu.twa';
const SITE = 'https://stargateedu.co.kr';
const RELATION = 'delegate_permission/common.handle_all_urls';

function normalize(raw) {
  const hex = raw.replace(/^\s*SHA-?256\s*:?\s*/i, '').replace(/[\s:]/g, '').toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(hex)) {
    throw new Error(`SHA-256 지문 형식이 아닙니다 (16진수 64자리 필요): ${raw}`);
  }
  return hex.match(/../g).join(':');
}

async function load() {
  const statements = JSON.parse(await fs.readFile(FILE, 'utf8'));
  const entry = statements.find(
    (s) => s.target?.namespace === 'android_app' && s.target.package_name === PACKAGE,
  );
  if (!entry) throw new Error(`${FILE}에 ${PACKAGE} 항목이 없습니다.`);
  return { statements, entry };
}

async function check() {
  const { entry } = await load();
  let ok = true;
  for (const fp of entry.target.sha256_cert_fingerprints) {
    const url = new URL('https://digitalassetlinks.googleapis.com/v1/assetlinks:check');
    url.search = new URLSearchParams({
      'source.web.site': SITE,
      relation: RELATION,
      'target.android_app.package_name': PACKAGE,
      'target.android_app.certificate.sha256_fingerprint': fp,
    });
    const res = await (await fetch(url)).json();
    ok &&= res.linked === true;
    console.log(`${res.linked ? '✅ linked' : '❌ not linked'}  ${fp}`);
  }
  if (!ok) {
    console.log('배포 직후라면 GitHub Pages 반영과 Google 캐시(최대 1시간)를 기다린 뒤 다시 확인하세요.');
    process.exitCode = 1;
  }
}

async function add(raw) {
  const fp = normalize(raw);
  const { statements, entry } = await load();
  const list = entry.target.sha256_cert_fingerprints;
  if (list.includes(fp)) {
    console.log(`이미 등록된 지문입니다: ${fp}`);
    return;
  }
  list.push(fp);
  await fs.writeFile(FILE, `${JSON.stringify(statements, null, 2)}\n`);
  console.log(`추가했습니다 (${PACKAGE}, 총 ${list.length}개): ${fp}`);
}

const arg = process.argv[2];
if (!arg) {
  console.error('사용법: node scripts/add-twa-fingerprint.mjs <SHA-256> | --check');
  process.exit(2);
}
try {
  await (arg === '--check' ? check() : add(process.argv.slice(2).join(' ')));
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
