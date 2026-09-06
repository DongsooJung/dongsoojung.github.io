import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const [headers, ...records] = rows;
  return records.filter((values) => values.some(Boolean))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

function positiveInteger(value) {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  const number = digits ? Number(digits) : null;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeVendorUrl(value) {
  const url = String(value || '').trim();
  if (/^https:\/\/(?:www\.)?aladin\.co\.kr\/shop\/wproduct\.aspx\?ItemId=\d+/i.test(url)) return ['aladinUrl', url];
  if (/^https:\/\/(?:product|www)\.kyobobook\.co\.kr\//i.test(url)) return ['kyoboUrl', url];
  return null;
}

export function normalizePriceTitle(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\s]/gu, '');
}

export function applyPriceRows(payload, rows) {
  const booksByTitle = new Map();
  for (const book of payload.books) {
    if (booksByTitle.has(book.title)) throw new Error(`공개 도서 제목이 중복됩니다: ${book.title}`);
    booksByTitle.set(book.title, book);
  }
  const seen = new Set();
  const records = [];
  const statusCounts = {};
  for (const row of rows) {
    const title = row['도서명'];
    if (seen.has(title)) throw new Error(`가격 파일 도서명이 중복됩니다: ${title}`);
    seen.add(title);
    statusCounts[row['조회 상태']] = (statusCounts[row['조회 상태']] || 0) + 1;
    const book = booksByTitle.get(title);
    if (!book) throw new Error(`가격 파일 도서를 공개 목록에서 찾지 못했습니다: ${title}`);
    if (!['기존 정가', '조회 완료'].includes(row['조회 상태'])) continue;
    if (row['조회 상태'] === '조회 완료'
      && normalizePriceTitle(title) !== normalizePriceTitle(row['매칭된 도서명'])) continue;
    const listPrice = positiveInteger(row['정가(원)']);
    const salePrice = positiveInteger(row['판매가(원)']);
    if (!listPrice && !salePrice) continue;
    const record = { title, listPrice, salePrice, source: row['조회처'] || 'Notion' };
    const vendor = safeVendorUrl(row['링크']);
    if (vendor) record[vendor[0]] = vendor[1];
    records.push(record);
  }
  if (seen.size !== payload.books.length) {
    throw new Error(`가격 파일 ${seen.size}권과 공개 목록 ${payload.books.length}권의 수가 다릅니다.`);
  }
  return {
    updatedAt: new Date().toISOString().slice(0, 10),
    matchKey: 'exact-title',
    acceptedRule: '기존 정가 또는 정규화한 원제와 매칭 도서명이 정확히 같은 조회 완료 결과',
    sourceSummary: { total: rows.length, ...statusCounts },
    records,
  };
}

export function applyPriceEnrichment(books, priceData) {
  const byTitle = new Map((priceData?.records || []).map((record) => [record.title, record]));
  return books.map((book) => {
    const price = byTitle.get(book.title);
    if (!price) return book;
    return {
      ...book,
      listPrice: book.listPrice ?? price.listPrice,
      salePrice: price.salePrice,
      ...(book.aladinUrl || !price.aladinUrl ? {} : { aladinUrl: price.aladinUrl }),
      ...(price.kyoboUrl ? { kyoboUrl: price.kyoboUrl } : {}),
    };
  });
}

async function main() {
  const csvPath = process.argv[2];
  const pricesPath = process.argv[3] || 'reading/data/book-prices.json';
  const outputPath = process.argv[4] || 'reading/data/books.json';
  if (!csvPath) throw new Error('사용법: node scripts/import-reading-prices.mjs <가격 CSV> [book-prices.json] [books.json]');
  const [csv, json] = await Promise.all([fs.readFile(csvPath, 'utf8'), fs.readFile(outputPath, 'utf8')]);
  const payload = JSON.parse(json);
  const priceData = applyPriceRows(payload, parseCsv(csv.replace(/^\uFEFF/, '')));
  payload.books = applyPriceEnrichment(payload.books, priceData);
  payload.priceUpdatedAt = priceData.updatedAt;
  await Promise.all([
    fs.writeFile(pricesPath, `${JSON.stringify(priceData, null, 2)}\n`, 'utf8'),
    fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8'),
  ]);
  const list = priceData.records.filter((record) => record.listPrice).length;
  const sale = priceData.records.filter((record) => record.salePrice).length;
  console.log(`가격 ${priceData.records.length}권 반영 · 정가 ${list}권 · 판매가 ${sale}권`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
