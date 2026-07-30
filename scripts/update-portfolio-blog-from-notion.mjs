import fs from 'node:fs/promises';

const OUT = new URL('../portfolio/data/notion-posts.json', import.meta.url);
const NOTION_API_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
const DATABASE_ID =
  process.env.NOTION_PORTFOLIO_DATABASE_ID ||
  process.env.NOTION_DATABASE_ID ||
  '2e8faefee4594eb0be6197e7fe6e1816';
const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID || '';
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';

if (!NOTION_API_KEY) {
  throw new Error(
    'NOTION_API_KEY가 없습니다. Notion 내부 연결 토큰을 환경 변수로 등록해야 합니다.',
  );
}

const richText = (property) =>
  (property?.title || property?.rich_text || []).map((item) => item.plain_text || '').join('');
const select = (property) => property?.select?.name || '';
const multiSelect = (property) => (property?.multi_select || []).map((item) => item.name);
const checkbox = (property) => Boolean(property?.checkbox);
const date = (property) => property?.date?.start?.slice(0, 10) || '';
const number = (property) =>
  Number.isFinite(property?.number) && property.number >= 0 ? property.number : null;
const rating = (property) =>
  Math.min(5, Math.max(0, [...select(property)].filter((char) => char === '⭐').length));

function firstTitle(properties = {}) {
  for (const value of Object.values(properties)) {
    if (value?.type === 'title') return richText(value);
  }
  return '';
}

function normalize(page) {
  const properties = page.properties || {};
  const title =
    richText(properties['도서명']) ||
    richText(properties['제목']) ||
    richText(properties['Name']) ||
    firstTitle(properties) ||
    '제목 미등록';
  const summary =
    richText(properties['한줄평']) ||
    richText(properties['요약']) ||
    richText(properties['Summary']) ||
    '';
  const body =
    richText(properties['독후감본문']) ||
    richText(properties['본문']) ||
    richText(properties['내용']) ||
    '';
  const category =
    select(properties['대분류']) ||
    select(properties['카테고리']) ||
    select(properties['Category']) ||
    'Notion';
  const publishedAt =
    date(properties['완독일']) ||
    date(properties['발행일']) ||
    date(properties['Published']) ||
    (page.last_edited_time || '').slice(0, 10);

  return {
    id: String(page.id || '').replaceAll('-', ''),
    source: 'notion',
    title,
    summary,
    body,
    category,
    author: richText(properties['저자']) || 'Dongsoo Jung',
    tags: multiSelect(properties['추천대상']).concat(
      richText(properties['핵심키워드'])
        .split(/[,，\n]/)
        .map((value) => value.trim().replace(/^#/, ''))
        .filter(Boolean),
    ),
    rating: rating(properties['평점']),
    pages: number(properties['페이지수']),
    publishedAt,
    updatedAt: page.last_edited_time || null,
    url: page.url || `https://www.notion.so/${String(page.id || '').replaceAll('-', '')}`,
    public: checkbox(properties['웹공개']) || !('웹공개' in properties),
  };
}

async function notionFetch(path, body) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${NOTION_API_KEY}`,
      'content-type': 'application/json',
      'notion-version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Notion API HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response.json();
}

async function queryAll() {
  const pages = [];
  let cursor;

  if (DATA_SOURCE_ID) {
    do {
      const payload = await notionFetch(`/data_sources/${DATA_SOURCE_ID}/query`, {
        filter: { property: '웹공개', checkbox: { equals: true } },
        sorts: [{ property: '완독일', direction: 'descending' }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      pages.push(...payload.results.filter((item) => item.object === 'page'));
      cursor = payload.has_more ? payload.next_cursor : null;
    } while (cursor);
    return pages;
  }

  do {
    const payload = await notionFetch(`/databases/${DATABASE_ID}/query`, {
      filter: { property: '웹공개', checkbox: { equals: true } },
      sorts: [{ property: '완독일', direction: 'descending' }],
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...payload.results.filter((item) => item.object === 'page'));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  // 공개 체크박스가 아직 없는 신규 DB도 허용: 공개 결과가 없으면 최근 페이지를 제한적으로 포함
  if (!pages.length) {
    const fallback = await notionFetch(`/databases/${DATABASE_ID}/query`, {
      page_size: 20,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    });
    pages.push(...fallback.results.filter((item) => item.object === 'page'));
  }

  return pages;
}

const pages = await queryAll();
const posts = pages.map(normalize).filter((post) => post.public !== false);
posts.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));

let previous = { posts: [] };
try {
  previous = JSON.parse(await fs.readFile(OUT, 'utf8'));
} catch (_) {
  /* first run */
}

const output = {
  meta: {
    status: 'connected',
    source: 'Notion · Portfolio Blog',
    generatedAt: new Date().toISOString(),
    databaseId: DATABASE_ID,
    dataSourceId: DATA_SOURCE_ID || null,
    publicFilter: '웹공개 = true (없으면 최근 항목)',
    count: posts.length,
  },
  posts,
};

await fs.mkdir(new URL('.', OUT), { recursive: true });
await fs.writeFile(OUT, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const changed = JSON.stringify(previous.posts) !== JSON.stringify(posts);
console.log(
  changed
    ? `Updated portfolio Notion snapshot: ${posts.length} posts`
    : `Portfolio Notion snapshot unchanged: ${posts.length} posts`,
);
