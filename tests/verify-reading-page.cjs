const { chromium } = require('playwright');

(async () => {
  const baseUrl = process.env.VERIFY_URL || 'http://127.0.0.1:8765/reading/';
  const [booksPayload, reviewsPayload, featuredPayload] = await Promise.all([
    fetch(new URL('./data/books.json', baseUrl)).then((response) => response.json()),
    fetch(new URL('./data/notion-reading.json', baseUrl)).then((response) => response.json()),
    fetch(new URL('./data/featured-ai-books.json', baseUrl)).then((response) => response.json()),
  ]);
  const expected = {
    books: booksPayload.books.length,
    reviews: reviewsPayload.posts.length,
    linked: booksPayload.books.filter((book) => book.reviewIds?.length).length,
    priced: booksPayload.books.filter((book) => Number.isFinite(book.listPrice) || Number.isFinite(book.salePrice)).length,
    salePrices: booksPayload.books.filter((book) => Number.isFinite(book.salePrice)).length,
    featured: featuredPayload.books.length,
  };
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction((count) => document.querySelectorAll('#libraryRows tr').length === count, expected.books);
  const initial = await page.evaluate(() => ({
    books: document.querySelectorAll('#libraryRows tr').length,
    reviews: document.querySelectorAll('#grid .card').length,
    linkedButtons: document.querySelectorAll('#libraryRows .review-link').length,
    pricedBooks: [...document.querySelectorAll('#libraryRows .book-price')].filter((cell) => cell.textContent !== '—').length,
    salePrices: [...document.querySelectorAll('#libraryRows .book-price')].filter((cell) => cell.textContent.includes('판매가')).length,
    detailLinks: document.querySelectorAll('#libraryRows .book-detail-link').length,
  }));
  const linkedRow = page.locator('#libraryRows tr').filter({ has: page.locator('.review-link') }).first();
  const detailHref = await linkedRow.locator('.book-detail-link').getAttribute('href');
  const detailPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const detailResponse = await detailPage.goto(new URL(detailHref, response.url()).href, { waitUntil: 'networkidle' });
  const detailDocument = await detailPage.evaluate(() => ({
    title: document.querySelector('h1')?.textContent.trim(),
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    reviewVisible: Boolean(document.querySelector('.review')),
    schemaType: JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent || '{}')['@graph']?.[0]?.['@type'],
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  await detailPage.close();
  await page.selectOption('#libraryFeatured', 'true');
  await page.waitForFunction((count) => document.querySelectorAll('#libraryRows tr').length === count, expected.featured);
  const featuredHref = await page.locator('#libraryRows .book-detail-link').first().getAttribute('href');
  const featuredPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const featuredResponse = await featuredPage.goto(new URL(featuredHref, response.url()).href, { waitUntil: 'networkidle' });
  const featuredDocument = await featuredPage.evaluate(() => {
    const graph = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent || '{}')['@graph'];
    return {
      title: document.querySelector('h1')?.textContent.trim(),
      curationVisible: Boolean(document.querySelector('.curation')),
      coverVisible: Boolean(document.querySelector('.book-cover')),
      publisher: graph?.[0]?.publisher?.name,
      schemaImage: graph?.[0]?.image,
      robots: document.querySelector('meta[name="robots"]')?.content,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
  await featuredPage.close();
  await page.selectOption('#libraryFeatured', '');
  await page.selectOption('#libraryReview', 'true');
  await page.waitForFunction((count) => document.querySelectorAll('#libraryRows tr').length === count, expected.linked);
  const linkedOnly = await page.locator('#librarySummary').innerText();
  await page.evaluate(() => Object.defineProperty(navigator, 'share', {
    configurable: true, value: async (data) => { window.__sharedReadingUrl = data.url; },
  }));
  await page.locator('#libraryRows .review-link').first().click();
  await page.waitForFunction(() => document.querySelector('#overlay').classList.contains('open'));
  await page.locator('#overlay .sharebtn').click();
  const sharedUrl = await page.evaluate(() => window.__sharedReadingUrl);
  const detail = await page.evaluate(() => ({
    title: document.querySelector('#postTitle').textContent,
    hash: location.hash,
    reviewsVisible: !document.querySelector('#reviewsView').hidden,
  }));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction((count) => document.querySelectorAll('#libraryRows tr').length === count, expected.books);
  const mobile = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    tableScrollable: document.querySelector('.library-table-wrap').scrollWidth > document.querySelector('.library-table-wrap').clientWidth,
  }));
  const result = { status: response.status(), expected, initial,
    detailPage: { status: detailResponse.status(), ...detailDocument },
    featuredPage: { status: featuredResponse.status(), ...featuredDocument }, sharedUrl, linkedOnly, detail, mobile, errors };
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (response.status() !== 200 || initial.books !== expected.books || initial.reviews !== expected.reviews
    || initial.linkedButtons !== expected.linked || initial.pricedBooks !== expected.priced
    || initial.salePrices !== expected.salePrices || initial.detailLinks !== expected.books
    || detailResponse.status() !== 200 || !detailDocument.title || !detailDocument.canonical?.includes('/reading/')
    || !detailDocument.reviewVisible || detailDocument.schemaType !== 'Book'
    || detailDocument.bodyWidth > detailDocument.viewportWidth
    || featuredResponse.status() !== 200 || !featuredDocument.title || !featuredDocument.curationVisible
    || !featuredDocument.coverVisible || !featuredDocument.publisher || !featuredDocument.schemaImage
    || !featuredDocument.robots?.startsWith('index,follow')
    || featuredDocument.bodyWidth > featuredDocument.viewportWidth
    || !sharedUrl?.includes('/reading/') || sharedUrl.includes('#book-')
    || !linkedOnly.includes(`${expected.linked}권`) || !detail.hash.startsWith('#book-') || !detail.reviewsVisible
    || errors.length || mobile.bodyWidth > mobile.viewportWidth || !mobile.tableScrollable) process.exit(1);
})();
