const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(process.env.VERIFY_URL || 'http://127.0.0.1:8765/reading/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#libraryRows tr').length === 598);
  const initial = await page.evaluate(() => ({
    books: document.querySelectorAll('#libraryRows tr').length,
    reviews: document.querySelectorAll('#grid .card').length,
    linkedButtons: document.querySelectorAll('#libraryRows .review-link').length,
    pricedBooks: [...document.querySelectorAll('#libraryRows .book-price')].filter((cell) => cell.textContent !== '—').length,
    salePrices: [...document.querySelectorAll('#libraryRows .book-price')].filter((cell) => cell.textContent.includes('판매가')).length,
  }));
  await page.selectOption('#libraryReview', 'true');
  await page.waitForFunction(() => document.querySelectorAll('#libraryRows tr').length === 3);
  const linkedOnly = await page.locator('#librarySummary').innerText();
  await page.locator('#libraryRows .review-link').first().click();
  await page.waitForFunction(() => document.querySelector('#overlay').classList.contains('open'));
  const detail = await page.evaluate(() => ({
    title: document.querySelector('#postTitle').textContent,
    hash: location.hash,
    reviewsVisible: !document.querySelector('#reviewsView').hidden,
  }));
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelectorAll('#libraryRows tr').length === 598);
  const mobile = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    tableScrollable: document.querySelector('.library-table-wrap').scrollWidth > document.querySelector('.library-table-wrap').clientWidth,
  }));
  const result = { status: response.status(), initial, linkedOnly, detail, mobile, errors };
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (response.status() !== 200 || initial.books !== 598 || initial.reviews !== 3 || initial.linkedButtons !== 3
    || initial.pricedBooks !== 346 || initial.salePrices !== 252
    || !linkedOnly.includes('3권') || !detail.hash.startsWith('#book-') || !detail.reviewsVisible
    || errors.length || mobile.bodyWidth > mobile.viewportWidth || !mobile.tableScrollable) process.exit(1);
})();
