import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { catalogShrinkIsUnsafe, linkRecords, makeOutput, normalizeTitle, parseMarkdownSections } from '../scripts/update-reading-from-notion.mjs';

test('Notion markdown의 지정 H2 섹션을 구조화한다', () => {
  const parsed = parseMarkdownSections(`# 제목
## 📌 한 줄 요약
짧은 결론입니다.
## 🔑 핵심 메시지 3가지
- 첫 번째
- **두 번째**
## 💡 인상 깊은 구절
> 기억할 문장
## 🎯 내 일·연구에 적용
1. 교육 과정에 반영
## 👥 추천 대상 & 이유
- 연구자`);
  assert.deepEqual(parsed, {
    oneline: '짧은 결론입니다.',
    keyPoints: ['첫 번째', '두 번째'],
    quotes: ['기억할 문장'],
    application: ['교육 과정에 반영'],
    recommend: ['연구자'],
    review: [],
  });
});

test('관계 ID 연결이 제목 fallback보다 우선하고 LOG 상태가 읽음 상태보다 우선한다', () => {
  const result = linkRecords([
    { notionId: 'book1', title: '다른 제목', read: false, status: '읽을 예정', relatedLogIds: ['log1'] },
  ], [
    { id: 'log1', title: '일치하지 않는 제목', status: '재독', relatedBookIds: [] },
  ]);
  assert.deepEqual(result.books[0].reviewIds, ['log1']);
  assert.equal(result.books[0].matchMethod, 'relation');
  assert.equal(result.books[0].status, '재독');
  assert.equal(result.books[0].read, true);
  assert.deepEqual(result.posts[0].bookIds, ['book1']);
});

test('괄호 속 영문 부제와 공백·문장부호를 제거한 고유 제목만 연결한다', () => {
  assert.equal(normalizeTitle('생각에 관한 생각 (Thinking, Fast and Slow)'), '생각에관한생각');
  const unique = linkRecords([
    { notionId: 'book1', title: '생각에 관한 생각', read: false, relatedLogIds: [] },
  ], [
    { id: 'log1', title: '생각에 관한 생각 (Thinking, Fast and Slow)', status: '완독', relatedBookIds: [] },
  ]);
  assert.equal(unique.books[0].matchMethod, 'unique-title');
  assert.deepEqual(unique.posts[0].bookIds, ['book1']);

  const ambiguous = linkRecords([
    { notionId: 'book1', title: '중복 제목', read: false, relatedLogIds: [] },
    { notionId: 'book2', title: '중복 제목', read: false, relatedLogIds: [] },
  ], [{ id: 'log1', title: '중복 제목', status: '완독', relatedBookIds: [] }]);
  assert.deepEqual(ambiguous.books.map((book) => book.reviewIds), [[], []]);
  assert.deepEqual(ambiguous.posts[0].bookIds, []);

  const relationWins = linkRecords([
    { notionId: 'book1', title: '연결 제목', read: false, relatedLogIds: [] },
    { notionId: 'book2', title: '다른 제목', read: false, relatedLogIds: [] },
  ], [{ id: 'log1', title: '연결 제목', status: '완독', relatedBookIds: ['book2'] }]);
  assert.deepEqual(relationWins.books[0].reviewIds, []);
  assert.deepEqual(relationWins.books[1].reviewIds, ['log1']);

  const inaccessibleRelationTarget = linkRecords([
    { notionId: 'snapshot-1', title: '연결 제목', read: false, relatedLogIds: [] },
  ], [{ id: 'log1', title: '연결 제목', status: '완독', relatedBookIds: ['inaccessible-book-id'] }]);
  assert.equal(inaccessibleRelationTarget.books[0].matchMethod, null);
});

test('현재 598권 스냅샷을 손실 없이 읽고 기존 표시 필드를 유지한다', async () => {
  const payload = JSON.parse(await fs.readFile(new URL('../reading/data/books.json', import.meta.url), 'utf8'));
  assert.equal(payload.total, 598);
  assert.equal(payload.books.length, 598);
  for (const book of payload.books) {
    for (const key of ['title', 'author', 'category', 'subCategory', 'read', 'rating', 'aladinUrl', 'listPrice']) {
      assert.ok(Object.hasOwn(book, key), `${book.title}: ${key}`);
    }
  }
});

test('내용이 같으면 두 데이터셋의 생성 시각을 보존한다', () => {
  const linked = { books: [{ title: '책', relatedLogIds: [] }], posts: [{ id: 'log', relatedBookIds: [] }] };
  const previousBooks = { generatedAt: 'books-old', catalogStatus: 'connected', books: [{ title: '책' }] };
  const previousReviews = { meta: { generatedAt: 'reviews-old' }, posts: [{ id: 'log' }] };
  const output = makeOutput(previousBooks, previousReviews, linked, 'new-time');
  assert.equal(output.changed, false);
  assert.equal(output.booksOutput.generatedAt, 'books-old');
  assert.equal(output.reviewsOutput.meta.generatedAt, 'reviews-old');
});

test('Notion 정가가 비어 있어도 별도 가격 데이터를 합친다', () => {
  const linked = { books: [{ notionId: 'book1', title: '책', aladinUrl: null, listPrice: null, relatedLogIds: [] }], posts: [] };
  const previousBooks = { generatedAt: 'old', catalogStatus: 'connected', books: [] };
  const prices = { records: [{ title: '책', listPrice: 18000, salePrice: 16200,
    kyoboUrl: 'https://product.kyobobook.co.kr/detail/1' }] };
  const output = makeOutput(previousBooks, { meta: {}, posts: [] }, linked, 'new-time', 'connected', prices);
  assert.equal(output.booksOutput.books[0].listPrice, 18000);
  assert.equal(output.booksOutput.books[0].salePrice, 16200);
  assert.equal(output.booksOutput.books[0].kyoboUrl, 'https://product.kyobobook.co.kr/detail/1');
  assert.equal(output.booksOutput.priceUpdatedAt, undefined);
});

test('Notion 동기화 후에도 가격 갱신일을 보존한다', () => {
  const linked = { books: [], posts: [] };
  const output = makeOutput(
    { generatedAt: 'old', catalogStatus: 'connected', priceUpdatedAt: '2026-09-04', books: [] },
    { meta: {}, posts: [] }, linked, 'new-time', 'connected', {},
  );
  assert.equal(output.booksOutput.priceUpdatedAt, '2026-09-04');
});

test('공개 도서가 갑자기 20% 넘게 줄면 덮어쓰기를 차단한다', () => {
  assert.equal(catalogShrinkIsUnsafe(598, 598), false);
  assert.equal(catalogShrinkIsUnsafe(598, 478), true);
  assert.equal(catalogShrinkIsUnsafe(598, 477), true);
  assert.equal(catalogShrinkIsUnsafe(598, 30), true);
  assert.equal(catalogShrinkIsUnsafe(598, 30, true), false);
});
