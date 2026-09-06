import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBookSlug, withBookSlugs } from '../scripts/reading-book-utils.mjs';

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

test('전체 상세 페이지, canonical, sitemap과 구조화 데이터가 일치한다', async () => {
  const [booksPayload, reviewsPayload, manifest, sitemap] = await Promise.all([
    readJson('reading/data/books.json'), readJson('reading/data/notion-reading.json'),
    readJson('reading/data/generated-book-pages.json'), fs.readFile(path.join(root, 'reading/sitemap.xml'), 'utf8'),
  ]);
  assert.equal(manifest.total, booksPayload.books.length);
  assert.deepEqual(new Set(manifest.slugs), new Set(booksPayload.books.map((book) => book.slug)));
  assert.equal((sitemap.match(/<url>/g) || []).length, manifest.indexable + 1);
  const reviewsById = new Set(reviewsPayload.posts.map((review) => review.id));
  for (const book of booksPayload.books) {
    const html = await fs.readFile(path.join(root, 'reading', book.slug, 'index.html'), 'utf8');
    const canonical = `https://stargateedu.co.kr/reading/${encodeURIComponent(book.slug)}/`;
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical}">`));
    const shouldIndex = (book.reviewIds || []).some((id) => reviewsById.has(id));
    assert.equal(sitemap.includes(`<loc>${canonical}</loc>`), shouldIndex, `${book.title}: sitemap 색인 정책 불일치`);
    assert.ok(html.includes(`content="${shouldIndex ? 'index,follow,max-image-preview:large' : 'noindex,follow'}"`));
    const match = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
    assert.ok(match, `${book.title}: JSON-LD 누락`);
    const graph = JSON.parse(match[1])['@graph'];
    assert.equal(graph[0]['@type'], 'Book');
    assert.equal(graph[0].name, book.title);
    for (const reviewId of book.reviewIds || []) {
      assert.ok(reviewsById.has(reviewId), `${book.title}: 존재하지 않는 독서기록`);
      assert.ok(html.includes(`id="review-${reviewId}"`), `${book.title}: 독서기록 본문 누락`);
    }
  }
});
