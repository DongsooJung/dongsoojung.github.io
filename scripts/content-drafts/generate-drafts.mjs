// Semi-automated content drafts for stargatelearn.com.
//
// Claude writes an English olympiad-math post, a second call re-solves the
// problems without seeing the draft's answers, and the result is saved as a
// WordPress DRAFT only. Publishing stays a manual step in wp-admin.
//
//   node generate-drafts.mjs [--count 1] [--topic "..."] [--out ./out] [--dry-run]
//
// Env: ANTHROPIC_API_KEY (required)
//      WP_SITE, WP_USER, WP_APP_PASSWORD (optional; without them drafts are
//      written to --out only)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-opus-5-5';
const SITE_DEFAULT = 'stargatelearn.com';
const WP_STATUS = 'draft'; // never 'publish' - human approval is the point
let Anthropic; // Pure helpers also run in CI jobs that do not install this SDK.

export const TOPICS = [
  { title: 'Parity: odd and even arguments', aliases: ['parity', 'odd and even'] },
  { title: 'The pigeonhole principle', aliases: ['pigeonhole'] },
  { title: 'Telescoping sums', aliases: ['telescoping'] },
  { title: 'Invariants in games and puzzles', aliases: ['invariant', 'invariants'] },
  { title: 'Double counting', aliases: ['double counting', 'handshake', 'handshakes'] },
  { title: 'Modular arithmetic and remainders', aliases: ['modular arithmetic', 'remainder', 'remainders', 'last digit'] },
  { title: 'Extremal principle', aliases: ['extremal'] },
  { title: 'Angle chasing', aliases: ['angle chasing'] },
  { title: 'Arithmetic and geometric sequences', aliases: ['arithmetic sequence', 'geometric sequence', 'arithmetic progression', 'geometric progression'] },
  { title: 'Complementary counting', aliases: ['complementary counting', 'complement counting'] },
  { title: 'Prime factorization and valuations', aliases: ['prime factor', 'prime factors', 'valuation', 'valuations'] },
  { title: 'Area ratios', aliases: ['area ratio', 'area ratios'] },
  { title: 'Working backwards', aliases: ['working backward', 'work backward'] },
  { title: 'Counting grid paths', aliases: ['grid path', 'counting grid paths'] },
  { title: 'Triangle inequality', aliases: ['triangle inequality'] },
  { title: 'Divisors and multiples', aliases: ['divisor', 'divisors', 'multiples'] },
  { title: 'Symmetry in counting', aliases: ['symmetry'] },
  { title: 'Digit sums and divisibility', aliases: ['digit sum', 'digit sums', 'divisibility'] },
  { title: 'Constructive proofs', aliases: ['constructive proof', 'constructive proofs', 'construction proof'] },
  { title: 'Counting rectangles in a grid', aliases: ['rectangle', 'rectangles'] },
];

function topicText(value) {
  return decodeEntities(String(value)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Monday 00:00 in Seoul is the beginning of a weekly rotation slot.
export function selectTopic(avoid, { now = new Date(), topics = TOPICS } = {}) {
  const seoulTime = now.getTime() + 9 * 60 * 60 * 1000;
  if (!Number.isFinite(seoulTime)) throw new Error('유효하지 않은 주제 선택 날짜입니다');
  const week = Math.floor((seoulTime - Date.UTC(1970, 0, 5)) / (7 * 24 * 60 * 60 * 1000));
  const existing = avoid.map(topicText);
  for (let i = 0; i < topics.length; i++) {
    const candidate = topics[((week + i) % topics.length + topics.length) % topics.length];
    const aliases = [candidate.title, ...candidate.aliases].map(topicText);
    if (!existing.some((title) => aliases.some((alias) => ` ${title} `.includes(` ${alias} `)))) {
      return candidate.title;
    }
  }
  throw new Error('주제 순환 목록을 모두 사용했습니다. 목록을 보완하거나 --topic으로 지정하세요');
}

export function parseArgs(argv) {
  const opts = { count: 1, topic: '', out: path.join(HERE, 'out'), dryRun: false, requireWordPress: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') opts.count = Number(argv[++i]);
    else if (a === '--topic') opts.topic = String(argv[++i] ?? '').trim();
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--require-wordpress') opts.requireWordPress = true;
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  if (!Number.isInteger(opts.count) || opts.count < 1 || opts.count > 5) {
    throw new Error('--count 는 1~5 사이 정수여야 합니다');
  }
  if (opts.dryRun && opts.requireWordPress) throw new Error('--dry-run과 --require-wordpress는 함께 사용할 수 없습니다');
  return opts;
}

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'slug', 'excerpt', 'tags', 'problems', 'content_html'],
  properties: {
    title: { type: 'string' },
    slug: { type: 'string' },
    excerpt: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['statement', 'answer'],
        properties: { statement: { type: 'string' }, answer: { type: 'string' } },
      },
    },
    content_html: { type: 'string' },
  },
};

const SOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['answer', 'confidence'],
        properties: {
          answer: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
};

const WRITER_SYSTEM = `You write posts for Stargate Learn (stargatelearn.com), an English-language blog of short olympiad-style math lessons for strong middle-school and early high-school students.

Each post teaches one idea through problems:
- 900-1500 words of body text, plain and friendly, no hype.
- 2-5 <h2> sections. Start with a short hook, then a worked example with a complete solution, then 1-2 practice problems.
- Put each practice problem's solution inside <details><summary>Show solution</summary>...</details>.
- HTML only: p, h2, h3, ul, ol, li, strong, em, code, blockquote, details, summary, table, thead, tbody, tr, th, td. No scripts, styles, images, or links.
- Write math in plain text or with <code> (for example: n^2 + 1, a ≡ b (mod 9)).
- Every number in every solution must be checked. If you are not certain an answer is right, choose a different problem.

In "problems", list every problem that appears in the post (worked example first) with the exact statement and the final answer as a short value.
"slug" is lowercase words joined by hyphens. "excerpt" is one or two sentences. "tags" holds 2-5 short topic tags.`;

const SOLVER_SYSTEM = `You are checking a math blog before publication. Solve each problem independently and carefully. Return only the final answer for each, as a short value, in the same order as given, with your confidence.`;

function requireKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY 가 설정되지 않았습니다');
  }
}

async function callJson(client, { system, user, schema, effort }) {
  const msg = await client.beta.messages
    .stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort, format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    })
    .finalMessage();
  if (msg.stop_reason === 'refusal') {
    throw new Error(`Claude가 요청을 거절했습니다 (${msg.stop_details?.category ?? '분류 없음'})`);
  }
  if (msg.stop_reason === 'max_tokens') throw new Error('응답이 max_tokens 에서 잘렸습니다');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { data: JSON.parse(text), usage: msg.usage, model: msg.model };
}

export async function fetchExistingTitles(site = SITE_DEFAULT, {
  user = process.env.WP_USER, appPassword = process.env.WP_APP_PASSWORD, fetchImpl = fetch,
} = {}) {
  const headers = {};
  const statuses = ['publish'];
  if (user && appPassword) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${appPassword}`).toString('base64')}`;
    statuses.push('draft', 'pending', 'future');
  }
  const titles = new Set();
  for (const status of statuses) {
    let pages = 1;
    for (let page = 1; page <= pages; page++) {
      const url = new URL(`https://${site}/wp-json/wp/v2/posts`);
      url.search = new URLSearchParams({ per_page: '100', status, _fields: 'title', page: String(page) }).toString();
      const res = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`WordPress 제목 조회 실패 (${status}, page ${page}): HTTP ${res.status}`);
      const posts = await res.json();
      const totalPages = Number(res.headers.get('x-wp-totalpages'));
      if (!Array.isArray(posts) || !Number.isInteger(totalPages) || totalPages < 0) {
        throw new Error(`WordPress 제목 조회 응답이 올바르지 않습니다 (${status})`);
      }
      if (!res.headers.has('x-wp-totalpages')) throw new Error('WordPress 전체 페이지 수를 확인할 수 없습니다');
      pages = totalPages;
      for (const post of posts) {
        const title = decodeEntities(post.title?.rendered ?? '');
        if (title) titles.add(title);
      }
    }
  }
  return [...titles];
}

export async function loadHistory(out) {
  try {
    const history = JSON.parse(await fs.readFile(path.join(out, 'topic-history.json'), 'utf8'));
    if (!Array.isArray(history) || history.some((entry) => !entry || typeof entry.title !== 'string' || typeof entry.topic !== 'string')) {
      throw new Error('제목과 주제 배열이 필요합니다');
    }
    return history;
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw new Error(`주제 이력을 읽을 수 없습니다: ${e.message}`);
  }
}

export function decodeEntities(s) {
  return s
    .replace(/&#8217;/g, '’')
    .replace(/&#8216;/g, '‘')
    .replace(/&#8220;/g, '“')
    .replace(/&#8221;/g, '”')
    .replace(/&#8211;/g, '–')
    .replace(/&amp;/g, '&');
}

// Model output goes into wp-admin as HTML. Keep only the tags the prompt
// allows, with no attributes; drop dangerous elements with their contents.
const ALLOWED_TAGS = new Set([
  'p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'code', 'blockquote',
  'details', 'summary', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br',
]);

const TAG_ALT = [...ALLOWED_TAGS].join('|');
const ALLOWED_OPEN_RE = new RegExp(`<(\\/?)(${TAG_ALT})\\b[^<>]*>`, 'gi');
const ALLOWED_ESCAPED_RE = new RegExp(`&lt;(\\/?)(${TAG_ALT})&gt;`, 'g');

// Escape first, then restore only exact allowed tags. Nothing that reaches
// the output can open a tag unless it is one of ALLOWED_TAGS without attributes.
export function sanitizeHtml(html) {
  const normalized = String(html).replace(ALLOWED_OPEN_RE, (_, close, name) => `<${close}${name.toLowerCase()}>`);
  const escaped = normalized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/&lt;(script|style|iframe|object|embed|template|noscript|svg|math)\b[\s\S]*?&lt;\/\1\s*&gt;/gi, '')
    .replace(/&lt;!--[\s\S]*?--&gt;/g, '')
    .replace(ALLOWED_ESCAPED_RE, '<$1$2>')
    .replace(/&lt;\/?[a-zA-Z][a-zA-Z0-9]*(?:(?!&gt;)[\s\S])*&gt;/g, '');
}

export function safeSlug(slug, fallback) {
  const s = String(slug ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return s || fallback;
}

export function escapeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function normalizeAnswer(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\s$\\{}]/g, '')
    .replace(/[.]+$/, '')
    .replace(/^(answer|ans)[:=]/, '');
}

export function compareAnswers(problems, solved) {
  return problems.map((p, i) => {
    const s = solved[i];
    const ok = !!s && normalizeAnswer(s.answer) === normalizeAnswer(p.answer);
    return { statement: p.statement, claimed: p.answer, independent: s?.answer ?? '(없음)', confidence: s?.confidence ?? '-', ok };
  });
}

async function writeOne(client, { topic, avoid }) {
  const user = [
    topic ? `Topic for this post: ${topic}` : 'Choose a fresh topic that fits the blog.',
    'Do not repeat these existing post titles or their main idea:',
    ...avoid.map((t) => `- ${t}`),
  ].join('\n');
  const draft = await callJson(client, { system: WRITER_SYSTEM, user, schema: DRAFT_SCHEMA, effort: 'high' });
  const d = draft.data;
  if (!d.problems.length) throw new Error('초안에 문제가 없습니다');
  const solveUser = d.problems.map((p, i) => `Problem ${i + 1}: ${p.statement}`).join('\n\n');
  const solved = await callJson(client, { system: SOLVER_SYSTEM, user: solveUser, schema: SOLVE_SCHEMA, effort: 'high' });
  return {
    ...d,
    content_html: sanitizeHtml(d.content_html),
    checks: compareAnswers(d.problems, solved.data.answers),
    usage: [draft.usage, solved.usage],
    servedBy: [draft.model, solved.model],
  };
}

export function wordpressDraftPayload(post) {
  const allOk = post.checks.every((c) => c.ok);
  return {
    status: WP_STATUS,
    title: allOk ? post.title : `[검토 필요] ${post.title}`,
    slug: post.slug,
    excerpt: post.excerpt,
    content: `<!-- wp:html -->\n${sanitizeHtml(post.content_html)}\n<!-- /wp:html -->`,
  };
}

export async function createWpDraft(post, {
  site = process.env.WP_SITE, user = process.env.WP_USER,
  appPassword = process.env.WP_APP_PASSWORD, fetchImpl = fetch,
} = {}) {
  if (!site || !user || !appPassword) throw new Error('WordPress 인증정보 WP_SITE·WP_USER·WP_APP_PASSWORD가 필요합니다');
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(site)) throw new Error('WP_SITE에는 HTTPS 도메인만 입력하세요');
  const auth = Buffer.from(`${user}:${appPassword}`).toString('base64');
  const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };
  const body = wordpressDraftPayload(post);
  const res = await fetchImpl(`https://${site}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers, redirect: 'error', signal: AbortSignal.timeout(30000),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WordPress 초안 생성 실패: HTTP ${res.status}. 재실행 전 기존 초안을 확인하세요`);
  const j = await res.json();
  if (!Number.isSafeInteger(j.id) || j.id <= 0) throw new Error('WordPress 응답에 유효한 글 ID가 없습니다. 재실행 전 기존 초안을 확인하세요');
  const editUrl = `https://${site}/wp-admin/post.php?post=${j.id}&action=edit`;
  try {
    if (j.status !== 'draft') throw new Error('생성 응답이 draft 상태가 아닙니다');
    const verify = await fetchImpl(`https://${site}/wp-json/wp/v2/posts/${j.id}?context=edit&_fields=id,status,title,content,excerpt`, {
      headers, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!verify.ok) throw new Error(`재조회 HTTP ${verify.status}`);
    const saved = await verify.json();
    const normalize = (value) => typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : null;
    if (saved.id !== j.id || saved.status !== 'draft') throw new Error('재조회 글 ID 또는 draft 상태가 일치하지 않습니다');
    for (const field of ['title', 'content', 'excerpt']) {
      if (normalize(saved[field]?.raw) !== normalize(body[field])) throw new Error(`재조회 ${field} 원문이 일치하지 않습니다`);
    }
  } catch (error) {
    throw new Error(`WordPress 글 ${j.id} 생성 후 검증 실패: ${error.message}. 중복 생성하지 말고 확인하세요: ${editUrl}`);
  }
  return { id: j.id, status: 'draft', contentVerified: true, editUrl };
}

export function reportMarkdown(results) {
  const lines = ['# 콘텐츠 초안 생성 결과', ''];
  for (const r of results) {
    if (r.error) {
      lines.push(`## 실패`, '', `- ${r.error}`, '');
      continue;
    }
    const allOk = r.checks.every((c) => c.ok);
    lines.push(`## ${r.title}`, '');
    if (r.topic) lines.push(`- 선택 주제: ${r.topic}`);
    lines.push(`- 검증: ${allOk ? '모든 정답이 독립 풀이와 일치' : '불일치 있음 - 게시 전 반드시 확인'}`);
    lines.push(`- 저장: ${r.wp ? `WordPress 초안 [편집 열기](${r.wp.editUrl})` : `파일 \`${r.file}\``}`);
    if (r.payloadFile) lines.push(`- 커넥터 등록용 초안: \`${r.payloadFile}\` (status=draft, 공개 발행 없음)`);
    if (r.wp?.contentVerified) lines.push('- 저장 검증: 별도 재조회에서 제목·본문·요약·draft 상태 일치');
    lines.push(`- 처리 모델: ${[...new Set(r.servedBy)].join(', ')}`);
    if (r.usage) {
      const sum = (k) => r.usage.reduce((a, u) => a + (u?.[k] ?? 0), 0);
      lines.push(`- 토큰: 입력 ${sum('input_tokens')}, 출력 ${sum('output_tokens')} (작성+검증)`);
    }
    lines.push('', '| # | 초안 정답 | 독립 풀이 | 신뢰도 | 일치 |', '|---|---|---|---|---|');
    r.checks.forEach((c, i) => lines.push(`| ${i + 1} | ${c.claimed} | ${c.independent} | ${c.confidence} | ${c.ok ? '예' : '**아니오**'} |`));
    lines.push('');
  }
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  // 라이브 콘텐츠 보강 모드. 주제가 __apply_page_updates__:<매니페스트> 면 초안 생성 대신
  // 이미 게시된 페이지·글의 본문에 구간을 추가한다(구독 폼 · 내부 링크 · 본문 보강).
  // 워드프레스 인증정보만 있으면 되고 AI 키는 필요 없다. 원본은 out/ 에 백업한다.
  if (opts.topic.startsWith('__apply_page_updates__')) {
    const name = opts.topic.slice('__apply_page_updates__'.length).replace(/^:/, '') || '2026-11-23-return-path';
    const { runPageUpdates } = await import('./apply-page-updates.mjs');
    const result = await runPageUpdates({
      manifestPath: path.join(HERE, 'page-updates', `${name}.mjs`),
      out: opts.out,
      dryRun: opts.dryRun,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const wpReady = !opts.dryRun && process.env.WP_SITE && process.env.WP_USER && process.env.WP_APP_PASSWORD;
  if (opts.requireWordPress && !wpReady) throw new Error('WordPress 직접 등록이 요청됐지만 WP_SITE·WP_USER·WP_APP_PASSWORD가 없습니다. AI 생성 전에 중단합니다');
  requireKey();
  Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic();
  await fs.mkdir(opts.out, { recursive: true });
  const history = await loadHistory(opts.out);
  const avoid = await fetchExistingTitles(process.env.WP_SITE || SITE_DEFAULT);
  avoid.push(...history.flatMap((entry) => [entry.title, entry.topic]));
  const results = [];
  for (let i = 0; i < opts.count; i++) {
    try {
      const topic = opts.topic || selectTopic(avoid);
      console.log(`선택 주제: ${topic}`);
      const post = await writeOne(client, { topic, avoid });
      post.topic = topic;
      post.slug = safeSlug(post.slug, `draft-${Date.now()}-${i + 1}`);
      post.file = path.join(opts.out, `${post.slug}.html`);
      await fs.writeFile(post.file, `<h1>${escapeText(post.title)}</h1>\n${post.content_html}\n`, 'utf8');
      post.payloadFile = path.join(opts.out, `${post.slug}.wordpress.json`);
      await fs.writeFile(post.payloadFile, JSON.stringify(wordpressDraftPayload(post), null, 2) + '\n', 'utf8');
      avoid.push(post.title, topic);
      history.push({ title: post.title, topic });
      await fs.writeFile(path.join(opts.out, 'topic-history.json'), JSON.stringify(history, null, 2) + '\n', 'utf8');
      if (wpReady) post.wp = await createWpDraft(post);
      results.push(post);
      console.log(`초안 완료: ${post.title}${post.wp ? ` (WordPress 초안 ${post.wp.id})` : ''}`);
    } catch (e) {
      results.push({ error: e instanceof Error ? e.message : String(e) });
      console.error(`초안 실패: ${e instanceof Error ? e.message : e}`);
    }
  }
  const report = reportMarkdown(results);
  await fs.writeFile(path.join(opts.out, 'report.md'), report, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, report + '\n');
  if (!wpReady) console.log(opts.dryRun ? 'dry run으로 파일에만 저장했습니다.' : 'WordPress 자격증명이 없어 파일로만 저장했습니다.');
  if (results.every((r) => r.error)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    if (Anthropic && e instanceof Anthropic.AuthenticationError) console.error('Anthropic API 키가 유효하지 않습니다');
    else if (Anthropic && e instanceof Anthropic.RateLimitError) console.error('요청 한도 초과 - 잠시 후 다시 실행하세요');
    else console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
