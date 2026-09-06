export function makeBookSlug(book = {}) {
  const stem = String(book.title || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '') || 'book';
  const id = String(book.notionId || '')
    .replace(/[^a-f0-9]/gi, '')
    .toLowerCase()
    .slice(-8) || 'unassigned';
  return `${stem}-${id}`;
}

export function withBookSlugs(books = [], previousBooks = []) {
  const previousById = new Map(previousBooks
    .filter((book) => book.notionId && book.slug)
    .map((book) => [book.notionId, book.slug]));
  const seen = new Set();
  return books.map((book) => {
    const slug = previousById.get(book.notionId) || book.slug || makeBookSlug(book);
    if (!/^[\p{L}\p{N}-]+$/u.test(slug)) throw new Error(`안전하지 않은 도서 상세 URL: ${slug}`);
    if (seen.has(slug)) throw new Error(`도서 상세 URL이 중복됩니다: ${slug}`);
    seen.add(slug);
    return { ...book, slug };
  });
}
