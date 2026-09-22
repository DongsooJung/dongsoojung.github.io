import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBookSlug, withBookSlugs } from '../scripts/reading-book-utils.mjs';
import { assertMatchingSource } from '../scripts/update-featured-ai-books.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relative) => fs.readFile(path.join(root, relative), 'utf8').then(JSON.parse);

test('도서 상세 slug는 한글을 보존하고 Notion ID로 중복을 막는다', () => {
  assert.equal(makeBookSlug({ title: '생각에 관한 생각 (Thinking, Fast and Slow)', notionId: '1234567890abcdef' }),
    '생각에-관한-생각-thinking-fast-and-slow-90abcdef');
  const books = withBookSlugs([
    { title: '같은 제목', notionId: '11111111' }, { title: '같은 제목', notionId: '22222222' },
  ]);
  assert.notEqual(books[0].slug, books[1].slug);
  const renamed = withBookSlugs([{ title: '바뀐 제목', notionId: '11111111' }], books);
  assert.equal(renamed[0].slug, books[0].slug);
});

test('대표 도서 출처는 같은 제목과 알라딘 표지만 허용한다', () => {
  assert.doesNotThrow(() => assertMatchingSource('파이썬 업무 자동화 (RPA)', {
    name: 'IT 비전공자를 위한 파이썬 업무 자동화(RPA)',
    image: 'https://image.aladin.co.kr/product/example.jpg',
  }));
  assert.throws(() => assertMatchingSource('파이썬 업무 자동화 (RPA)', {
    name: '파이썬 업무 자동화 일잘러 되기 + 챗GPT',
    image: 'https://image.aladin.co.kr/product/example.jpg',
  }), /출처 도서명이 일치하지 않습니다/);
  assert.throws(() => assertMatchingSource('AI 2041', {
    name: 'AI 2041', image: 'https://example.com/cover.jpg',
  }), /허용되지 않은 표지 URL/);
});

test('전체 상세 페이지, canonical, sitemap과 구조화 데이터가 일치한다', async () => {
  const [booksPayload, reviewsPayload, featuredPayload, notesPayload, manifest, sitemap, readingIndex] = await Promise.all([
    readJson('reading/data/books.json'), readJson('reading/data/notion-reading.json'),
    readJson('reading/data/featured-ai-books.json'),
    readJson('reading/data/featured-reading-notes.json'),
    readJson('reading/data/generated-book-pages.json'), fs.readFile(path.join(root, 'reading/sitemap.xml'), 'utf8'),
    fs.readFile(path.join(root, 'reading/index.html'), 'utf8'),
  ]);
  assert.equal(featuredPayload.total, 30);
  assert.equal(new Set(featuredPayload.books.map((book) => book.notionId)).size, 30);
  for (const featured of featuredPayload.books) {
    assert.ok(featured.author && featured.publisher && featured.coverUrl && featured.isbn && featured.sourceTitle);
    assert.match(featured.sourceUrl, /^https:\/\/www\.aladin\.co\.kr\/shop\/wproduct\.aspx\?ItemId=\d+$/);
    assert.match(featured.coverUrl, /^https:\/\/image\.aladin\.co\.kr\//);
    assert.ok(featured.curationNote && featured.keywords.length >= 2);
  }
  const featuredById = new Map(featuredPayload.books.map((book) => [book.notionId, book]));
  assert.equal(notesPayload.total, 7);
  assert.equal(notesPayload.notes.length, 7);
  assert.equal(new Set(notesPayload.notes.map((note) => note.bookId)).size, 7);
  assert.ok(readingIndex.includes('id="notesTab"'));
  assert.ok(readingIndex.includes('개인 완독 독후감과 구분됩니다.'));
  const books = booksPayload.books.map((book) => featuredById.has(book.notionId)
    ? { ...book, ...featuredById.get(book.notionId), title: book.title, slug: book.slug, featuredAi: true }
    : book);
  assert.equal(manifest.total, books.length);
  assert.deepEqual(new Set(manifest.slugs), new Set(books.map((book) => book.slug)));
  assert.equal((sitemap.match(/<url>/g) || []).length, manifest.indexable + 1);
  const reviewsById = new Set(reviewsPayload.posts.map((review) => review.id));
  const bookIds = new Set(books.map((book) => book.notionId));
  const notesByBookId = new Map(notesPayload.notes.map((note) => [note.bookId, note]));
  for (const note of notesPayload.notes) {
    assert.equal(note.sourceType, 'editorial-curation');
    assert.ok(bookIds.has(note.bookId), `${note.title}: 전체 서재에 없는 책`);
    assert.ok(note.oneline && note.keyPoints.length >= 3 && note.application.length >= 2);
    assert.ok(note.relatedProjects.length >= 1);
    assert.equal(Object.hasOwn(note, 'rating'), false);
    assert.equal(Object.hasOwn(note, 'end'), false);
    for (const project of note.relatedProjects) assert.match(project.url, /^\/[\p{L}\p{N}-]+(?:\/[\p{L}\p{N}-]+)*\/$/u);
  }
  for (const book of books) {
    const html = await fs.readFile(path.join(root, 'reading', book.slug, 'index.html'), 'utf8');
    const canonical = `https://stargateedu.co.kr/reading/${encodeURIComponent(book.slug)}/`;
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}">`));
    const shouldIndex = (book.reviewIds || []).some((id) => reviewsById.has(id))
      || notesByBookId.has(book.notionId)
      || Boolean(book.featuredAi && book.indexable === true && book.curationNote);
    assert.equal(sitemap.includes(`<loc>${canonical}</loc>`), shouldIndex, `${book.title}: sitemap 색인 정책 불일치`);
    assert.ok(html.includes(`content="${shouldIndex ? 'index,follow,max-image-preview:large' : 'noindex,follow'}"`));
    const match = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
    assert.ok(match, `${book.title}: JSON-LD 누락`);
    const graph = JSON.parse(match[1])['@graph'];
    assert.equal(graph[0]['@type'], 'Book');
    assert.equal(graph[0].name, book.title);
    if (book.featuredAi) {
      assert.equal(graph[0].publisher.name, book.publisher);
      assert.equal(graph[0].image, book.coverUrl);
      assert.ok(html.includes('STARGATE EDU AI CURATION'));
      assert.ok(html.includes('개인 독후감과 구분됩니다.'));
    }
    if (notesByBookId.has(book.notionId)) {
      const note = notesByBookId.get(book.notionId);
      assert.ok(html.includes('대표 독서노트'));
      assert.ok(html.includes('완독 여부·별점·읽은 날짜를 표시하지 않은 편집형 독서노트입니다.'));
      for (const project of note.relatedProjects) assert.ok(html.includes(`href="${project.url}"`));
    }
    for (const reviewId of book.reviewIds || []) {
      assert.ok(reviewsById.has(reviewId), `${book.title}: 존재하지 않는 독서기록`);
      assert.ok(html.includes(`id="review-${reviewId}"`), `${book.title}: 독서기록 본문 누락`);
    }
  }
});
