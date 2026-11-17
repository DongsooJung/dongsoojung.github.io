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
import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL = 'claude-opus-5-5';
const SITE_DEFAULT = 'stargatelearn.com';
const WP_STATUS = 'draft'; // never 'publish' - human approval is the point

export function parseArgs(argv) {
  const opts = { count: 1, topic: '', out: path.join(HERE, 'out'), dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--count') opts.count = Number(argv[++i]);
    else if (a === '--topic') opts.topic = String(argv[++i] ?? '').trim();
    else if (a === '--out') opts.out = path.resolve(argv[++i]);
    else if (a === '--dry-run') opts.dryRun = true;
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  if (!Number.isInteger(opts.count) || opts.count < 1 || opts.count > 5) {
    throw new Error('--count 는 1~5 사이 정수여야 합니다');
  }
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

export async function fetchExistingTitles(site = SITE_DEFAULT) {
  const url = `https://${site}/wp-json/wp/v2/posts?per_page=50&status=publish&_fields=title`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const posts = await res.json();
  return posts.map((p) => decodeEntities(p.title?.rendered ?? '')).filter(Boolean);
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

export function sanitizeHtml(html) {
  return html
    .replace(/<(script|style|iframe|object|embed|template|noscript|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (tag, name) => {
      const n = name.toLowerCase();
      if (!ALLOWED_TAGS.has(n)) return '';
      return tag.startsWith('</') ? `</${n}>` : `<${n}>`;
    });
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

async function createWpDraft(post) {
  const { WP_SITE, WP_USER, WP_APP_PASSWORD } = process.env;
  const auth = Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');
  const allOk = post.checks.every((c) => c.ok);
  const body = {
    status: WP_STATUS,
    title: allOk ? post.title : `[검토 필요] ${post.title}`,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content_html,
  };
  if (body.status !== 'draft') throw new Error('초안 상태가 아닌 게시는 허용하지 않습니다');
  const res = await fetch(`https://${WP_SITE}/wp-json/wp/v2/posts`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`WordPress 초안 생성 실패: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { id: j.id, editUrl: `https://${WP_SITE}/wp-admin/post.php?post=${j.id}&action=edit` };
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
    lines.push(`- 검증: ${allOk ? '모든 정답이 독립 풀이와 일치' : '불일치 있음 - 게시 전 반드시 확인'}`);
    lines.push(`- 저장: ${r.wp ? `WordPress 초안 [편집 열기](${r.wp.editUrl})` : `파일 \`${r.file}\``}`);
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
  requireKey();
  const client = new Anthropic();
  const wpReady = !opts.dryRun && process.env.WP_SITE && process.env.WP_USER && process.env.WP_APP_PASSWORD;
  await fs.mkdir(opts.out, { recursive: true });
  const avoid = await fetchExistingTitles(process.env.WP_SITE || SITE_DEFAULT);
  const results = [];
  for (let i = 0; i < opts.count; i++) {
    try {
      const post = await writeOne(client, { topic: opts.topic, avoid });
      avoid.push(post.title);
      post.file = path.join(opts.out, `${post.slug}.html`);
      await fs.writeFile(post.file, `<h1>${post.title}</h1>\n${post.content_html}\n`, 'utf8');
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
  if (!wpReady) console.log('WordPress 자격증명이 없어 파일로만 저장했습니다.');
  if (results.every((r) => r.error)) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    if (e instanceof Anthropic.AuthenticationError) console.error('Anthropic API 키가 유효하지 않습니다');
    else if (e instanceof Anthropic.RateLimitError) console.error('요청 한도 초과 - 잠시 후 다시 실행하세요');
    else console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
