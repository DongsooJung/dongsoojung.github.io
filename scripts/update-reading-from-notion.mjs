import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REVIEWS_OUT = new URL('../reading/data/notion-reading.json', import.meta.url);
const BOOKS_OUT = new URL('../reading/data/books.json', import.meta.url);
const NOTION_API_KEY = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
const LOG_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID || '66846d6d-864e-42dc-99db-2b61b315f8d4';
const BOOKS_DATA_SOURCE_ID = process.env.NOTION_BOOKS_DATA_SOURCE_ID || 'de859d89-39b2-43c1-8f59-296cfa579113';
const NOTION_VERSION = '2026-03-11';

const colors = {
  'AI·IT·프로그래밍': ['#334d6e', '#18283d'], '비즈니스·경영·창업': ['#6b4b2a', '#332313'],
  '투자·재테크·경제': ['#3c6447', '#1d3524'], '자기계발·심리': ['#704050', '#37202a'],
  '인문·사회·역사': ['#684c35', '#33251a'], '도시·부동산·건축': ['#5b4636', '#2d2119'],
  '교육·학습': ['#315f68', '#173137'], '과학·기술': ['#3e526b', '#1d2938'],
  '소설·문학': ['#68405f', '#351f30'], '법률·행정': ['#4f5663', '#262b33'],
  '군사·안보': ['#4b5c42', '#242f20'], 기타: ['#505766', '#262b34'],
};

const richText = (property) => (property?.title || property?.rich_text || []).map((item) => item.plain_text || '').join('');
const select = (property) => property?.select?.name || property?.status?.name || '';
const multiSelect = (property) => (property?.multi_select || []).map((item) => item.name);
const checkbox = (property) => Boolean(property?.checkbox);
const number = (property) => Number.isFinite(property?.number) && property.number >= 0 ? property.number : null;
const date = (property) => property?.date?.start?.slice(0, 10) || '';
const pageId = (id) => String(id || '').replaceAll('-', '');
const relationIds = (property) => (property?.relation || []).map((item) => pageId(item.id));
const splitLines = (value) => String(value || '').split(/\n+/).map((item) => item.trim()).filter(Boolean);
const keywords = (property) => richText(property).split(/[,，\n]/).map((value) => value.trim().replace(/^#/, '')).filter(Boolean);
const quotes = (property) => splitLines(richText(property)).map((value) => ({ t: value, s: 'Notion 기록' }));
const rating = (property) => {
  const value = select(property);
  const stars = [...value].filter((char) => char === '⭐').length;
  const numeric = Number.parseInt(value, 10);
  return Math.min(5, Math.max(0, stars || (Number.isFinite(numeric) ? numeric : 0)));
};
const unique = (values) => [...new Set(values.filter(Boolean))];

function cleanMarkdownLine(line) {
  return line.replace(/^\s*(?:[-*+] |\d+[.)]\s+)/, '').replace(/^>\s?/, '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '').replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[*_~`]/g, '').trim();
}

export function parseMarkdownSections(markdown = '') {
  const wanted = [
    [/한\s*줄\s*요약/, 'oneline'], [/핵심\s*메시지/, 'keyPoints'],
    [/인상\s*깊은\s*구절/, 'quotes'], [/내\s*일.*연구.*적용/, 'application'], [/추천\s*대상/, 'recommend'],
  ];
  const sections = { oneline: '', keyPoints: [], quotes: [], application: [], recommend: [] };
  let current = null;
  for (const rawLine of String(markdown).replaceAll('\r', '').split('\n')) {
    const heading = rawLine.match(/^##\s+(.+?)\s*#*$/);
    if (heading) {
      const label = cleanMarkdownLine(heading[1]);
      current = wanted.find(([pattern]) => pattern.test(label))?.[1] || null;
      continue;
    }
    if (!current || /^#{1,6}\s+/.test(rawLine)) continue;
    const value = cleanMarkdownLine(rawLine);
    if (!value || /^---+$/.test(value)) continue;
    if (current === 'oneline') sections.oneline ||= value;
    else sections[current].push(value);
  }
  return sections;
}

export function normalizeTitle(title = '') {
  return String(title).normalize('NFKC')
    .replace(/\((?=[^)]*[A-Za-z])[^)]*\)/g, '').replace(/\[(?=[^\]]*[A-Za-z])[^\]]*]/g, '')
    .toLocaleLowerCase('ko-KR').replace(/[\p{P}\p{S}\s]/gu, '');
}

function uniqueTitleIndex(records) {
  const candidates = new Map();
  for (const record of records) {
    const key = normalizeTitle(record.title);
    if (!key) continue;
    candidates.set(key, [...(candidates.get(key) || []), record]);
  }
  return new Map([...candidates].filter(([, values]) => values.length === 1));
}

export function linkRecords(catalogRecords, logRecords) {
  const booksById = new Map(catalogRecords.map((book) => [book.notionId, book]));
  const logsById = new Map(logRecords.map((post) => [post.id, post]));
  const uniqueBooks = uniqueTitleIndex(catalogRecords);
  const uniqueLogs = uniqueTitleIndex(logRecords);
  const bookLinks = new Map(catalogRecords.map((book) => [book.notionId, new Map()]));
  const logLinks = new Map(logRecords.map((post) => [post.id, new Map()]));
  const connect = (bookId, logId, method) => {
    if (!booksById.has(bookId) || !logsById.has(logId)) return;
    bookLinks.get(bookId).set(logId, method); logLinks.get(logId).set(bookId, method);
  };
  for (const book of catalogRecords) for (const logId of book.relatedLogIds || []) connect(book.notionId, logId, 'relation');
  for (const post of logRecords) for (const bookId of post.relatedBookIds || []) connect(bookId, post.id, 'relation');
  for (const book of catalogRecords) {
    if (bookLinks.get(book.notionId).size || book.relatedLogIds?.length) continue;
    const key = normalizeTitle(book.title), logs = uniqueLogs.get(key), books = uniqueBooks.get(key);
    if (logs?.length === 1 && books?.length === 1 && !logLinks.get(logs[0].id).size && !logs[0].relatedBookIds?.length) {
      connect(book.notionId, logs[0].id, 'unique-title');
    }
  }
  return {
    books: catalogRecords.map((book) => {
      const links = [...bookLinks.get(book.notionId)];
      const linkedPosts = links.map(([id]) => logsById.get(id));
      const linkedStatus = linkedPosts.some((post) => post.status === '재독') ? '재독'
        : linkedPosts.some((post) => post.status === '완독') ? '완독' : '';
      const status = linkedStatus || book.status || (book.read ? '완독' : '읽을 예정');
      return { ...book, read: ['완독', '재독'].includes(status) || book.read, status,
        reviewIds: links.map(([id]) => id),
        matchMethod: links.length ? (links.some(([, method]) => method === 'relation') ? 'relation' : 'unique-title') : null };
    }),
    posts: logRecords.map((post) => ({ ...post, bookIds: [...logLinks.get(post.id).keys()] })),
  };
}

function normalizeCatalogPage(page) {
  const properties = page.properties || {};
  const status = select(properties['읽음 상태']) || (checkbox(properties['읽음여부']) ? '완독' : '읽을 예정');
  return { title: richText(properties['도서명']), author: richText(properties['저자']) || richText(properties['저자/출판사']),
    category: select(properties['대분류']), subCategory: select(properties['카테고리']),
    read: checkbox(properties['읽음여부']) || ['완독', '재독'].includes(status), rating: rating(properties['평점']) || null,
    aladinUrl: properties['알라딘URL']?.url || null, listPrice: number(properties['정가']), notionId: pageId(page.id), status,
    relatedLogIds: relationIds(properties['독서LOG']) };
}

function normalizeLogPage(page, markdown = '') {
  const properties = page.properties || {}, genre = select(properties['대분류']) || '기타';
  const completedAt = date(properties['완독일']), [c1, c2] = colors[genre] || colors['기타'];
  const sections = parseMarkdownSections(markdown), propertyQuotes = quotes(properties['인용문']);
  return { id: pageId(page.id), title: richText(properties['도서명']) || '제목 미등록', author: richText(properties['저자']),
    pub: richText(properties['출판사']), genre, rating: rating(properties['평점']), status: select(properties['독서상태']) || '완독',
    start: date(properties['독서시작일']) || completedAt, end: completedAt, pages: number(properties['페이지수']) || 0, days: null, c1, c2,
    oneline: richText(properties['한줄평']) || sections.oneline,
    quotes: propertyQuotes.length ? propertyQuotes : sections.quotes.map((value) => ({ t: value, s: 'Notion 본문' })),
    review: richText(properties['독후감본문']), recommend: unique([...multiSelect(properties['추천대상']), ...sections.recommend]),
    tags: keywords(properties['핵심키워드']), keyPoints: sections.keyPoints, application: sections.application,
    relatedBookIds: unique([...relationIds(properties['도서']), ...relationIds(properties['관련도서']), ...relationIds(properties['도서목록'])]) };
}

async function notionRequest(path, options = {}) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://api.notion.com${path}`, { ...options,
      headers: { authorization: `Bearer ${NOTION_API_KEY}`, 'content-type': 'application/json', 'notion-version': NOTION_VERSION, ...options.headers },
      signal: AbortSignal.timeout(30000) });
    if (response.ok) return response.json();
    const detail = await response.text();
    if (attempt === 3 || (response.status !== 429 && response.status < 500)) {
      throw new Error(`Notion API HTTP ${response.status}: ${detail.slice(0, 500)}`);
    }
    const retryAfter = Number(response.headers.get('retry-after')) || 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 15) * 1000));
  }
  throw new Error('Notion API 재시도 한도를 초과했습니다.');
}

async function mapWithConcurrency(values, limit, mapper) {
  const output = new Array(values.length); let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next; next += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return output;
}

async function queryAll(dataSourceId, filter, sorts = []) {
  const pages = []; let cursor;
  do {
    const payload = await notionRequest(`/v1/data_sources/${dataSourceId}/query`, { method: 'POST',
      body: JSON.stringify({ filter, sorts, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }) });
    pages.push(...payload.results.filter((item) => item.object === 'page'));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);
  return pages;
}

async function hydrateRelation(page, propertyName) {
  const property = page.properties?.[propertyName];
  if (!property?.relation || !property.has_more || !property.id) return;
  const values = []; let cursor;
  do {
    const query = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
    const payload = await notionRequest(`/v1/pages/${page.id}/properties/${encodeURIComponent(property.id)}?${query}`);
    values.push(...(payload.results || []).map((item) => item.relation).filter(Boolean));
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);
  property.relation = values; property.has_more = false;
}

async function getPageMarkdown(id) {
  let markdown = '', cursor;
  do {
    const query = cursor ? `?${new URLSearchParams({ start_cursor: cursor })}` : '';
    const payload = await notionRequest(`/v1/pages/${id}/markdown${query}`, { method: 'GET' });
    markdown += `${markdown && payload.markdown ? '\n' : ''}${payload.markdown || ''}`;
    cursor = payload.has_more ? payload.next_cursor : null;
  } while (cursor);
  return markdown;
}

export function makeOutput(previousBooks, previousReviews, linked, now = new Date().toISOString()) {
  const books = linked.books.map(({ relatedLogIds, ...book }) => book);
  const posts = linked.posts.map(({ relatedBookIds, ...post }) => post);
  const booksChanged = JSON.stringify(previousBooks.books) !== JSON.stringify(books);
  const postsChanged = JSON.stringify(previousReviews.posts) !== JSON.stringify(posts);
  return { booksOutput: { generatedAt: booksChanged ? now : previousBooks.generatedAt,
      source: 'Notion · 📚 밀리의서재 도서목록', total: books.length, books },
    reviewsOutput: { meta: { status: 'connected', source: 'Notion · 📖 독서 LOG & 독후감',
        generatedAt: postsChanged ? now : previousReviews.meta?.generatedAt,
        publicFilter: '웹공개 = true · 독서상태 = 완독 또는 재독' }, posts }, changed: booksChanged || postsChanged };
}

export async function syncReading({ now = new Date().toISOString() } = {}) {
  if (!NOTION_API_KEY) throw new Error('NOTION_API_KEY가 없습니다. Notion 내부 연결 토큰을 GitHub Actions secret으로 등록해야 합니다.');
  const [catalogPages, logPages, previousBooks, previousReviews] = await Promise.all([
    queryAll(BOOKS_DATA_SOURCE_ID, { and: [
      { property: '웹공개', checkbox: { equals: true } }, { property: '도서명', title: { is_not_empty: true } }] },
      [{ property: '도서명', direction: 'ascending' }]),
    queryAll(LOG_DATA_SOURCE_ID, { and: [
      { property: '웹공개', checkbox: { equals: true } }, { or: [
        { property: '독서상태', select: { equals: '완독' } }, { property: '독서상태', select: { equals: '재독' } }] }] },
      [{ property: '완독일', direction: 'descending' }, { property: '도서명', direction: 'ascending' }]),
    fs.readFile(BOOKS_OUT, 'utf8').then(JSON.parse), fs.readFile(REVIEWS_OUT, 'utf8').then(JSON.parse),
  ]);
  await Promise.all([...catalogPages.map((page) => hydrateRelation(page, '독서LOG')),
    ...logPages.flatMap((page) => ['도서', '관련도서', '도서목록'].map((name) => hydrateRelation(page, name)))]);
  const markdownById = new Map(await mapWithConcurrency(logPages, 3,
    async (page) => [pageId(page.id), await getPageMarkdown(page.id)]));
  const linked = linkRecords(catalogPages.map(normalizeCatalogPage), logPages.map((page) => normalizeLogPage(page, markdownById.get(pageId(page.id)))));
  const output = makeOutput(previousBooks, previousReviews, linked, now);
  await Promise.all([fs.writeFile(BOOKS_OUT, `${JSON.stringify(output.booksOutput, null, 2)}\n`),
    fs.writeFile(REVIEWS_OUT, `${JSON.stringify(output.reviewsOutput, null, 2)}\n`)]);
  console.log(`Notion 공개 도서 ${output.booksOutput.total}권 · 독서기록 ${output.reviewsOutput.posts.length}편 동기화 완료${output.changed ? '' : ' (변경 없음)'}`);
  return output;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) await syncReading();
