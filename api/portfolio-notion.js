/**
 * Portfolio blog · Notion 공개 글 프록시
 *
 * GET /api/portfolio-notion
 *  - NOTION_API_KEY / NOTION_TOKEN 으로 공개(웹공개) 페이지를 조회
 *  - GitHub Pages 정적 스냅샷과 동일한 스키마로 반환
 */

const DATABASE_ID =
  process.env.NOTION_PORTFOLIO_DATABASE_ID ||
  process.env.NOTION_DATABASE_ID ||
  '2e8faefee4594eb0be6197e7fe6e1816';
const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID || '';
const NOTION_VERSION = process.env.NOTION_VERSION || '2022-06-28';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
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
    publishedAt:
      date(properties['완독일']) ||
      date(properties['발행일']) ||
      date(properties['Published']) ||
      (page.last_edited_time || '').slice(0, 10),
    updatedAt: page.last_edited_time || null,
    url: page.url || `https://www.notion.so/${String(page.id || '').replaceAll('-', '')}`,
    public: checkbox(properties['웹공개']) || !('웹공개' in properties),
  };
}

async function notionFetch(token, path, body) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'notion-version': NOTION_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Notion API HTTP ${response.status}`);
    error.status = response.status;
    error.detail = detail.slice(0, 400);
    throw error;
  }
  return response.json();
}

async function queryPosts(token) {
  const pages = [];
  let cursor;
  const endpoint = DATA_SOURCE_ID
    ? `/data_sources/${DATA_SOURCE_ID}/query`
    : `/databases/${DATABASE_ID}/query`;

  do {
    const payload = await notionFetch(token, endpoint, {
      filter: { property: '웹공개', checkbox: { equals: true } },
      sorts: [{ property: '완독일', direction: 'descending' }],
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...payload.results.filter((item) => item.object === 'page'));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);

  if (!pages.length) {
    const fallback = await notionFetch(token, endpoint, {
      page_size: 20,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    });
    pages.push(...fallback.results.filter((item) => item.object === 'page'));
  }

  return pages
    .map(normalize)
    .filter((post) => post.public !== false)
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }

  const token = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
  if (!token) {
    res.status(503).json({
      error: 'NOTION_API_KEY is not configured',
      hint: 'Vercel/GitHub에 Notion 내부 연결 토큰을 등록하세요. 정적 스냅샷 /portfolio/data/notion-posts.json 을 사용합니다.',
    });
    return;
  }

  try {
    const posts = await queryPosts(token);
    res.status(200).json({
      meta: {
        status: 'live',
        source: 'Notion API',
        generatedAt: new Date().toISOString(),
        databaseId: DATABASE_ID,
        dataSourceId: DATA_SOURCE_ID || null,
        count: posts.length,
        region: process.env.VERCEL_REGION || 'local',
      },
      posts,
    });
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.message || 'Notion proxy failed',
      detail: error.detail || null,
    });
  }
}
