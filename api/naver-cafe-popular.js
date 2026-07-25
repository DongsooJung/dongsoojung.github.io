const CAFE_ID = 12730407;
const SOURCE_URL =
  `https://apis.naver.com/cafe-web/cafe2/WeeklyPopularArticleListV3.json` +
  `?cafeId=${CAFE_ID}&mobileWeb=true&adUnit=PC_CAFE_BOARD&ad=false`;

const allowedOrigins = new Set([
  "https://stargateedu.co.kr",
  "https://www.stargateedu.co.kr",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function normalizeArticle(article, index) {
  return {
    rank: index + 1,
    articleId: Number(article.articleId),
    title: String(article.subject || "").trim(),
    author: String(article.nickname || "").trim(),
    writtenAt: new Date(Number(article.writeDateTimestamp)).toISOString(),
    comments: Number(article.commentCount || 0),
    views: Number(article.readCount || 0),
    likes: Number(article.upCount || 0),
    menuId: Number(article.menuId || 0),
    hasImage: Boolean(article.representImage),
    image: article.representImage || null,
    isNew: Boolean(article.newArticle),
    publicReadable: Boolean(article.enableToReadWhenNotCafeMember),
    url: `https://cafe.naver.com/ca-fe/cafes/${CAFE_ID}/articles/${article.articleId}?fromPopular=true`,
  };
}

export default async function handler(req, res) {
  const origin = String(req.headers.origin || "");
  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  try {
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
    const sourceArticles = raw?.message?.result?.articleList;
    if (!Array.isArray(sourceArticles) || sourceArticles.length === 0) {
      throw new Error("Naver Cafe API returned no articles");
    }

    const articles = sourceArticles.slice(0, 20).map(normalizeArticle);
    res.setHeader(
      "Cache-Control",
      "public, max-age=20, s-maxage=30, stale-while-revalidate=90",
    );
    res.status(200).json({
      schemaVersion: 1,
      cafeId: CAFE_ID,
      cafeName: "부동산 스터디",
      fetchedAt: new Date().toISOString(),
      sourceStatDate: String(sourceArticles[0]?.statDate || ""),
      source: "Naver Cafe public popular-article API",
      pageUrl: `https://cafe.naver.com/f-e/cafes/${CAFE_ID}/popular`,
      articleCount: articles.length,
      articles,
    });
  } catch (error) {
    res.status(502).json({
      error: "fetch_failed",
      detail: String(error?.message || error),
    });
  }
}
