import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withBookSlugs } from './reading-book-utils.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const READING_DIR = path.join(ROOT, 'reading');
const BOOKS_PATH = path.join(READING_DIR, 'data', 'books.json');
const REVIEWS_PATH = path.join(READING_DIR, 'data', 'notion-reading.json');
const MANIFEST_PATH = path.join(READING_DIR, 'data', 'generated-book-pages.json');
const SITEMAP_PATH = path.join(READING_DIR, 'sitemap.xml');
const ORIGIN = 'https://stargateedu.co.kr';

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const jsonLd = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const money = (value) => Number.isFinite(value) ? `${Number(value).toLocaleString('ko-KR')}원` : '';
const unique = (values) => [...new Set(values.filter(Boolean))];

function canonicalFor(slug) {
  return new URL(`/reading/${encodeURIComponent(slug)}/`, ORIGIN).href;
}

function safePurchaseLinks(book) {
  const links = [];
  if (/^https:\/\/(?:www\.)?aladin\.co\.kr\//i.test(book.aladinUrl || '')) {
    links.push({ label: '알라딘 도서정보', url: book.aladinUrl });
  }
  if (/^https:\/\/(?:product|www)\.kyobobook\.co\.kr\//i.test(book.kyoboUrl || '')) {
    links.push({ label: '교보문고 도서정보', url: book.kyoboUrl });
  }
  return links;
}

function makeStructuredData(book, reviews, canonical) {
  const offers = safePurchaseLinks(book);
  const price = book.salePrice ?? book.listPrice;
  const bookNode = {
    '@type': 'Book', '@id': `${canonical}#book`, name: book.title, url: canonical,
    isPartOf: { '@type': 'CollectionPage', name: 'StargateEdu 디지털 서재', url: `${ORIGIN}/reading/` },
    ...(book.author ? { author: { '@type': 'Person', name: book.author } } : {}),
    ...(book.subCategory || book.category ? { genre: book.subCategory || book.category } : {}),
    ...(Number.isFinite(price) && offers[0] ? { offers: {
      '@type': 'Offer', price, priceCurrency: 'KRW', url: offers[0].url,
    } } : {}),
  };
  const reviewNodes = reviews.map((review) => ({
    '@type': 'Review', '@id': `${canonical}#review-${review.id}`,
    itemReviewed: { '@id': `${canonical}#book` }, author: { '@type': 'Person', name: '정동수' },
    ...(review.end ? { datePublished: review.end } : {}),
    ...(review.oneline || review.review ? { reviewBody: review.oneline || review.review } : {}),
    ...(Number.isFinite(review.rating) && review.rating > 0 ? { reviewRating: {
      '@type': 'Rating', ratingValue: review.rating, bestRating: 5, worstRating: 1,
    } } : {}),
  }));
  return { '@context': 'https://schema.org', '@graph': [bookNode, ...reviewNodes] };
}

function renderReview(review) {
  const quotes = (review.quotes || []).map((quote) =>
    `<blockquote>${esc(quote.t)}<cite>${esc(quote.s || '독서기록')}</cite></blockquote>`).join('');
  const list = (title, values) => values?.length
    ? `<section><h2>${title}</h2><ul>${values.map((value) => `<li>${esc(value)}</li>`).join('')}</ul></section>` : '';
  return `<article class="review" id="review-${esc(review.id)}">
    <p class="eyebrow">${esc(review.status || '독서기록')}${review.end ? ` · ${esc(review.end)}` : ''}</p>
    <h2>나의 독서기록</h2>
    ${review.oneline ? `<p class="lead">${esc(review.oneline)}</p>` : ''}
    ${review.review ? `<section><h3>서평</h3><p>${esc(review.review)}</p></section>` : ''}
    ${quotes ? `<section><h3>기억할 문장</h3>${quotes}</section>` : ''}
    ${list('핵심 메시지', review.keyPoints)}
    ${list('사업·교육·연구에 적용할 점', review.application)}
    ${list('추천 대상', review.recommend)}
  </article>`;
}

function renderBookPage(book, reviews, related, priceUpdatedAt) {
  const canonical = canonicalFor(book.slug);
  const indexable = reviews.length > 0;
  const description = reviews[0]?.oneline
    || `${book.title}${book.author ? `, ${book.author}` : ''} 도서정보와 StargateEdu 독서기록`;
  const purchaseLinks = safePurchaseLinks(book);
  const priceParts = unique([
    Number.isFinite(book.listPrice) ? `정가 ${money(book.listPrice)}` : '',
    Number.isFinite(book.salePrice) ? `판매가 ${money(book.salePrice)}` : '',
  ]);
  const structuredData = makeStructuredData(book, reviews, canonical);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(book.title)} · StargateEdu 독서기록</title>
  <meta name="description" content="${esc(description.slice(0, 155))}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta name="robots" content="${indexable ? 'index,follow,max-image-preview:large' : 'noindex,follow'}">
  <meta name="theme-color" content="#0e1116">
  <meta property="og:type" content="book">
  <meta property="og:locale" content="ko_KR">
  <meta property="og:title" content="${esc(book.title)} · StargateEdu 독서기록">
  <meta property="og:description" content="${esc(description.slice(0, 155))}">
  <meta property="og:url" content="${esc(canonical)}">
  <link rel="icon" href="/assets/icons/favicon.ico">
  <link rel="stylesheet" href="/reading/detail.css?v=20260907">
  <script src="/assets/theme-boot.js"></script>
  <script type="application/ld+json">${jsonLd(structuredData)}</script>
</head>
<body>
  <a class="skip" href="#content">본문 바로가기</a>
  <header><a class="brand" href="/reading/"><span aria-hidden="true">📖</span> Stargate 독서기록</a><a href="/">STARGATE EDU</a></header>
  <main id="content">
    <nav aria-label="현재 위치"><a href="/reading/">디지털 서재</a><span aria-hidden="true">/</span><span>${esc(book.title)}</span></nav>
    <article class="book-hero">
      <p class="eyebrow">${esc(book.category || '기타')} · ${esc(book.subCategory || '분류 미등록')}</p>
      <h1>${esc(book.title)}</h1>
      <p class="author">${esc(book.author || '저자 정보 정리 중')}</p>
      <div class="facts">
        <div><span>독서 상태</span><strong>${esc(book.status || (book.read ? '완독' : '기록 전'))}</strong></div>
        <div><span>가격</span><strong>${priceParts.length ? esc(priceParts.join(' · ')) : '확인 중'}</strong></div>
        <div><span>독서기록</span><strong>${reviews.length ? `${reviews.length}편` : '준비 중'}</strong></div>
      </div>
      ${priceUpdatedAt && priceParts.length ? `<p class="verified">가격 확인일 ${esc(priceUpdatedAt)}</p>` : ''}
      ${purchaseLinks.length ? `<div class="actions">${purchaseLinks.map((link) => `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${esc(link.label)}</a>`).join('')}</div>` : ''}
    </article>
    ${reviews.length ? reviews.map(renderReview).join('') : `<section class="empty"><h2>독서기록 준비 중</h2><p>도서정보를 먼저 공개했으며, 읽은 이유와 적용점은 정리되는 대로 추가합니다.</p></section>`}
    <section class="related"><h2>같은 분야 도서</h2><div class="related-grid">${related.map((item) => `<a href="/reading/${encodeURIComponent(item.slug)}/"><strong>${esc(item.title)}</strong><span>${esc(item.author || item.subCategory || '도서정보 보기')}</span></a>`).join('')}</div></section>
  </main>
  <footer>© ${new Date().getUTCFullYear()} StargateEdu · 개인 독서기록</footer>
  <script src="/assets/theme.js?v=20260729" defer></script>
</body>
</html>`;
}

function assertSafeGeneratedPath(slug) {
  if (!/^[\p{L}\p{N}-]+$/u.test(slug) || slug === 'data') throw new Error(`안전하지 않은 상세 경로: ${slug}`);
  const target = path.resolve(READING_DIR, slug);
  if (path.dirname(target) !== READING_DIR) throw new Error(`reading 밖의 경로는 삭제할 수 없습니다: ${target}`);
  return target;
}

export async function generateReadingPages() {
  const [booksPayload, reviewsPayload, previousManifest] = await Promise.all([
    fs.readFile(BOOKS_PATH, 'utf8').then(JSON.parse),
    fs.readFile(REVIEWS_PATH, 'utf8').then(JSON.parse),
    fs.readFile(MANIFEST_PATH, 'utf8').then(JSON.parse).catch(() => ({ slugs: [] })),
  ]);
  const books = withBookSlugs(booksPayload.books);
  const reviewsById = new Map(reviewsPayload.posts.map((review) => [review.id, review]));
  const currentSlugs = new Set(books.map((book) => book.slug));
  for (const slug of previousManifest.slugs || []) {
    if (!currentSlugs.has(slug)) await fs.rm(assertSafeGeneratedPath(slug), { recursive: true, force: true });
  }
  for (const book of books) {
    const target = assertSafeGeneratedPath(book.slug);
    const reviews = (book.reviewIds || []).map((id) => reviewsById.get(id)).filter(Boolean);
    const related = books.filter((item) => item.notionId !== book.notionId
      && item.subCategory === book.subCategory).slice(0, 4);
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'index.html'), renderBookPage(book, reviews, related, booksPayload.priceUpdatedAt), 'utf8');
  }
  booksPayload.books = books;
  const indexableBooks = books.filter((book) => (book.reviewIds || []).some((id) => reviewsById.has(id)));
  const sitemapUrls = [`${ORIGIN}/reading/`, ...indexableBooks.map((book) => canonicalFor(book.slug))];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${esc(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
  const manifest = { generatedAt: booksPayload.generatedAt, total: books.length,
    indexable: indexableBooks.length, indexableSlugs: indexableBooks.map((book) => book.slug), slugs: [...currentSlugs] };
  await Promise.all([
    fs.writeFile(BOOKS_PATH, `${JSON.stringify(booksPayload, null, 2)}\n`, 'utf8'),
    fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    fs.writeFile(SITEMAP_PATH, sitemap, 'utf8'),
  ]);
  console.log(`도서 상세 ${books.length}개와 sitemap ${sitemapUrls.length}개 URL 생성 완료`);
  return { books, sitemapUrls, manifest };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) await generateReadingPages();
