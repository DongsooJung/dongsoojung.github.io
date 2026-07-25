import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CAFE_ID = 12730407;
const SOURCE_URL =
  `https://apis.naver.com/cafe-web/cafe2/WeeklyPopularArticleListV3.json` +
  `?cafeId=${CAFE_ID}&mobileWeb=true&adUnit=PC_CAFE_BOARD&ad=false`;

const formatKst = (timestamp) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));

const normalizeArticle = (article, index) => ({
  rank: index + 1,
  articleId: Number(article.articleId),
  title: String(article.subject || "").trim(),
  author: String(article.nickname || "").trim(),
  writtenAt: new Date(Number(article.writeDateTimestamp)).toISOString(),
  writtenAtKst: formatKst(Number(article.writeDateTimestamp)),
  comments: Number(article.commentCount || 0),
  views: Number(article.readCount || 0),
  likes: Number(article.upCount || 0),
  menuId: Number(article.menuId || 0),
  hasImage: Boolean(article.representImage),
  image: article.representImage || null,
  isNew: Boolean(article.newArticle),
  publicReadable: Boolean(article.enableToReadWhenNotCafeMember),
  url: `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${article.articleId}?fromPopular=true`,
});

const response = await fetch(SOURCE_URL, {
  headers: {
    Accept: "application/json",
    "User-Agent": "stargateedu-research-dashboard/1.0",
  },
});

if (!response.ok) {
  throw new Error(`Naver Cafe API returned ${response.status}`);
}

const raw = await response.json();
const result = raw?.message?.result;
const sourceArticles = result?.articleList;

if (!Array.isArray(sourceArticles) || sourceArticles.length === 0) {
  throw new Error("Naver Cafe API returned no popular articles");
}

const articles = sourceArticles.slice(0, 20).map(normalizeArticle);
const payload = {
  schemaVersion: 1,
  cafeId: CAFE_ID,
  cafeName: "부동산 스터디",
  fetchedAt: new Date().toISOString(),
  sourceStatDate: String(sourceArticles[0]?.statDate || ""),
  source: "Naver Cafe public popular-article API",
  sourceUrl: SOURCE_URL,
  pageUrl: `https://cafe.naver.com/f-e/cafes/${CAFE_ID}/popular`,
  articleCount: articles.length,
  articles,
};

const currentFile = fileURLToPath(import.meta.url);
const outputDir = path.join(path.dirname(currentFile), "data");
await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "latest.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
  "utf8",
);

console.log(
  `Saved ${payload.articleCount} articles fetched at ${payload.fetchedAt}`,
);
