#!/usr/bin/env node
// stargatelearn.com 운영 도구.
//
//   node stargatelearn-tools.mjs probe   읽기 전용 런타임 조사(플러그인/테마/포스트타입/위젯/마커 위치)
//   node stargatelearn-tools.mjs sync    확정한 주입 지점에 측정 스크립트 반영
//
// 자격 증명은 환경변수로만 받는다(WP_SITE / WP_USER / WP_APP_PASSWORD).
// 비밀값을 파일·인자·로그에 남기지 않는다.

import { Buffer } from 'node:buffer';

const MODE = (process.argv[2] || 'probe').toLowerCase();
// WP_SITE 는 스킴 없는 도메인이다(generate-drafts.mjs 와 같은 규약).
const SITE = (process.env.WP_SITE || 'stargatelearn.com').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const USER = process.env.WP_USER || '';
const APP_PASSWORD = (process.env.WP_APP_PASSWORD || '').replace(/\s+/g, '');
const MARKER = 'Stargate visit alert';

if (!USER || !APP_PASSWORD) {
  console.error('WP_USER / WP_APP_PASSWORD 가 없습니다.');
  process.exit(2);
}
if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(SITE)) {
  console.error('WP_SITE 는 도메인만 입력하세요(예: stargatelearn.com)');
  process.exit(2);
}

const AUTH = 'Basic ' + Buffer.from(`${USER}:${APP_PASSWORD}`).toString('base64');

async function get(path) {
  const res = await fetch(`https://${SITE}/wp-json${path}`, {
    headers: { Authorization: AUTH, Accept: 'application/json' },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 300);
  }
  return { status: res.status, body };
}

async function probe() {
  const out = { site: SITE, user: null, plugins: null, themes: null, types: null, widgets: null, sidebars: null, markerInContent: [] };

  const me = await get('/wp/v2/users/me');
  if (me.status === 200) {
    const c = me.body.capabilities || {};
    out.user = {
      id: me.body.id,
      name: me.body.name,
      roles: me.body.roles,
      hasAdminCaps: !!c.administrator,
      manageOptions: !!c.manage_options,
      managePlugins: !!c.manage_plugins,
      installPlugins: !!c.install_plugins,
      editThemes: !!c.edit_themes,
      switchThemes: !!c.switch_themes,
      activatePlugins: !!c.activate_plugins,
      editDashboard: !!c.edit_dashboard,
      unfilteredHtml: !!c.unfiltered_html,
    };
  } else {
    out.user = { error: me.status, detail: me.body };
  }

  const plugins = await get('/wp/v2/plugins?per_page=100&context=edit');
  out.plugins =
    plugins.status === 200
      ? { status: 200, count: plugins.body.length, items: plugins.body.map((p) => ({ plugin: p.plugin, name: p.name, status: p.status, version: p.version })) }
      : { status: plugins.status, detail: plugins.body };

  const themes = await get('/wp/v2/themes?per_page=100&context=edit');
  out.themes =
    themes.status === 200
      ? { status: 200, count: themes.body.length, items: themes.body.map((t) => ({ stylesheet: t.stylesheet, name: t.name, status: t.status, version: t.version })) }
      : { status: themes.status, detail: themes.body };

  const types = await get('/wp/v2/types');
  out.types =
    types.status === 200
      ? { status: 200, items: Object.values(types.body).map((t) => ({ name: t.name, slug: t.slug, restBase: t.rest_base, showInRest: t.show_in_rest })) }
      : { status: types.status, detail: types.body };

  const widgets = await get('/wp/v2/widgets?per_page=100&context=edit');
  out.widgets =
    widgets.status === 200
      ? { status: 200, count: widgets.body.length, items: widgets.body.map((w) => ({ id: w.id, idBase: w.id_base, sidebar: w.sidebar, hasMarker: String(w.rendered || '').includes(MARKER), rendered: String(w.rendered || '').slice(0, 160) })) }
      : { status: widgets.status, detail: widgets.body };

  const sidebars = await get('/wp/v2/sidebars');
  out.sidebars =
    sidebars.status === 200
      ? { status: 200, items: sidebars.body.map((s) => ({ id: s.id, name: s.name, widgets: (s.widgets || []).length })) }
      : { status: sidebars.status, detail: sidebars.body };

  for (const kind of ['pages', 'posts']) {
    const res = await get(`/wp/v2/${kind}?per_page=100&context=edit&status=any`);
    if (res.status !== 200 || !Array.isArray(res.body)) {
      out.markerInContent.push({ kind, status: res.status, note: '목록 조회 실패' });
      continue;
    }
    const hits = res.body
      .filter((p) => JSON.stringify(p.content || '').includes(MARKER))
      .map((p) => ({ id: p.id, slug: p.slug, status: p.status, link: p.link }));
    out.markerInContent.push({ kind, checked: res.body.length, markerHits: hits });
  }

  for (const dir of ['mu-plugins', 'plugins', 'themes']) {
    const res = await fetch(`https://${SITE}/wp-content/${dir}/`, { headers: { Authorization: AUTH } });
    out[`wp-content_${dir}`] = res.status;
  }

  // WPCode Lite (insert-headers-and-footers/ihaf) 가 주입처로 의심된다.
  // 라우트 인덱스는 인증 붙은 요청으로 다시 읽는다(익명 요청에는 관리용 라우트가 안 잡힐 수 있다).
  const index = await fetch(`https://${SITE}/wp-json/`, { headers: { Authorization: AUTH } });
  const indexBody = await index.json();
  const allRoutes = Object.keys(indexBody.routes ?? {});
  out.routeNamespaces = indexBody.namespaces ?? [];
  out.codeRoutes = allRoutes.filter((route) => /wpcode|ihaf|insert|snippet|header|footer|code/i.test(route));

  // WPCode 스니펫 후보 경로를 직접 시도한다.
  const snippetCandidates = [
    '/wpcode/v1/snippets',
    '/wpcode/v1/snippet',
    '/wpcode/v2/snippets',
    '/wpcode/v1/code',
    '/wpcode/v1/insert-headers-and-footers',
    '/wpcode/v1/settings',
    '/ihaf/v1/snippets',
    '/insert-headers-and-footers/v1/snippets',
  ];
  out.snippetCandidates = [];
  for (const candidate of snippetCandidates) {
    const res = await get(candidate);
    out.snippetCandidates.push({ path: candidate, status: res.status, preview: typeof res.body === 'string' ? res.body.slice(0, 200) : JSON.stringify(res.body).slice(0, 300) });
  }

  // wp-content 디렉터리/파일은 인증 붙은 요청에서 읽히는지 확인한다.
  out.wpContentFiles = [];
  for (const file of [
    'mu-plugins/',
    'plugins/insert-headers-and-footers/',
    'plugins/insert-headers-and-footers/readme.txt',
    'themes/assembler/functions.php',
  ]) {
    const res = await fetch(`https://${SITE}/wp-content/${file}`, { headers: { Authorization: AUTH } });
    const text = await res.text();
    out.wpContentFiles.push({ file, status: res.status, preview: text.replace(/\s+/g, ' ').slice(0, 300) });
  }

  // 블록 테마의 템플릿·템플릿 파트가 REST 로 열려 있는지 본다.
  // 열려 있으면 코드를 직접 넣는 경로가 되고, 닫혀 있으면 wp-admin 화면이 유일한 경로다.
  out.themeTemplates = {};
  for (const kind of ['templates', 'template-parts']) {
    const res = await get(`/wp/v2/${kind}?per_page=100&context=edit`);
    out.themeTemplates[kind] = Array.isArray(res.body)
      ? {
          status: 200,
          count: res.body.length,
          items: res.body.map((row) => ({
            id: row.id,
            slug: row.slug,
            title: row.title?.raw ?? row.title?.rendered,
            source: row.source,
            hasContent: typeof row.content?.raw === 'string' && row.content.raw.length > 0,
            contentLength: row.content?.raw?.length ?? 0,
          })),
        }
      : { status: res.status, detail: res.body };
  }

  // 수익화 표면: 워드프레스 코메르스 제품·폼·내비게이션
  out.commerce = {};  for (const kind of ['jp_pay_product', 'jetpack-forms', 'feedback', 'navigation', 'menu-items']) {
    const res = await get(`/wp/v2/${kind}?per_page=20&context=edit`);
    out.commerce[kind] = Array.isArray(res.body)
      ? { status: 200, count: res.body.length, items: res.body.map((row) => ({ id: row.id, slug: row.slug, title: row.title?.raw ?? row.title?.rendered, status: row.status })) }
      : { status: res.status, detail: res.body };
  }

  console.log(JSON.stringify(out, null, 2));
}

if (MODE === 'probe') {
  await probe();
} else {
  console.error(`알 수 없는 모드: ${MODE} (probe|sync 중 하나)`);
  process.exit(2);
}
