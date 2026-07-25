(() => {
  const CAFE_ID = 12730407;
  const LIVE_READER_URL =
    "https://r.jina.ai/http://apis.naver.com/cafe-web/cafe2/" +
    "WeeklyPopularArticleListV3.json?cafeId=12730407%26mobileWeb=true%26adUnit=PC_CAFE_BOARD%26ad=false";
  const STORAGE_KEY = "stargate:naver-cafe-popular:v1";
  const FALLBACK_URL = "./data/latest.json";
  const state = {
    payload: null,
    topic: "all",
    query: "",
    sort: "rank",
    loading: false,
  };

  const el = {
    refresh: document.querySelector("[data-refresh]"),
    refreshLabel: document.querySelector("[data-refresh-label]"),
    download: document.querySelector("[data-download]"),
    status: document.querySelector("[data-status]"),
    statusText: document.querySelector("[data-status-text]"),
    sourceBadge: document.querySelector("[data-source-badge]"),
    fetchedAt: document.querySelector("[data-fetched-at]"),
    metricCount: document.querySelector("[data-metric-count]"),
    metricViews: document.querySelector("[data-metric-views]"),
    metricComments: document.querySelector("[data-metric-comments]"),
    metricTop: document.querySelector("[data-metric-top]"),
    metricTopValue: document.querySelector("[data-metric-top-value]"),
    brief: document.querySelector("[data-brief]"),
    topicBars: document.querySelector("[data-topic-bars]"),
    search: document.querySelector("[data-search]"),
    sort: document.querySelector("[data-sort]"),
    topicButtons: [...document.querySelectorAll("[data-topic]")],
    resultCount: document.querySelector("[data-result-count]"),
    list: document.querySelector("[data-article-list]"),
    empty: document.querySelector("[data-empty]"),
    template: document.querySelector("#article-template"),
  };

  const number = new Intl.NumberFormat("ko-KR");
  const dateTime = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const topicDefinitions = {
    "real-estate": {
      label: "부동산",
      keywords: [
        "부동산", "아파트", "재건축", "재개발", "매수", "매매", "전세", "월세",
        "위례", "방배", "목동", "송파", "강남", "광진", "성동", "토허", "종부세",
        "보유세", "상속세", "주택", "분양", "청약",
      ],
    },
    policy: {
      label: "정책·정치",
      keywords: [
        "정부", "대통령", "이재명", "윤석열", "선관위", "탄핵", "토론회", "정권",
        "교수", "국민", "정책", "세금",
      ],
    },
    life: { label: "생활·기타", keywords: [] },
  };

  function classify(title) {
    const text = String(title || "").toLowerCase();
    if (topicDefinitions["real-estate"].keywords.some((word) => text.includes(word))) {
      return "real-estate";
    }
    if (topicDefinitions.policy.keywords.some((word) => text.includes(word))) {
      return "policy";
    }
    return "life";
  }

  function normalizeRaw(raw, sourceLabel = "실시간 브리지") {
    if (Array.isArray(raw?.articles)) {
      return {
        ...raw,
        sourceMode: sourceLabel,
        articles: raw.articles.map((article, index) => ({
          ...article,
          rank: Number(article.rank || index + 1),
          topic: classify(article.title),
        })),
      };
    }

    const result = raw?.message?.result;
    const sourceArticles = result?.articleList;
    if (!Array.isArray(sourceArticles) || sourceArticles.length === 0) {
      throw new Error("인기글 데이터가 비어 있습니다.");
    }

    const articles = sourceArticles.slice(0, 20).map((article, index) => ({
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
      topic: classify(article.subject),
    }));

    return {
      schemaVersion: 1,
      cafeId: CAFE_ID,
      cafeName: "부동산 스터디",
      fetchedAt: new Date().toISOString(),
      sourceStatDate: String(sourceArticles[0]?.statDate || ""),
      source: "Naver Cafe public popular-article API",
      sourceMode: sourceLabel,
      pageUrl: `https://cafe.naver.com/f-e/cafes/${CAFE_ID}/popular`,
      articleCount: articles.length,
      articles,
    };
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 18000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  function parseReaderResponse(text) {
    const marker = "Markdown Content:";
    const markerIndex = text.indexOf(marker);
    const start = text.indexOf("{", markerIndex >= 0 ? markerIndex : 0);
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      throw new Error("읽기 브리지 응답에서 JSON을 찾지 못했습니다.");
    }
    return JSON.parse(text.slice(start, end + 1));
  }

  async function fetchLive() {
    if (location.hostname.endsWith(".vercel.app")) {
      const direct = await fetchWithTimeout("/api/naver-cafe-popular");
      if (direct.ok) return normalizeRaw(await direct.json(), "실시간 API");
    }

    const response = await fetchWithTimeout(LIVE_READER_URL, {
      headers: { Accept: "text/plain" },
    });
    if (!response.ok) {
      throw new Error(`읽기 브리지 응답 ${response.status}`);
    }
    return normalizeRaw(parseReaderResponse(await response.text()), "실시간 브리지");
  }

  async function fetchFallback() {
    const response = await fetchWithTimeout(
      `${FALLBACK_URL}?t=${Date.now()}`,
      {},
      10000,
    );
    if (!response.ok) throw new Error("저장 데이터도 불러오지 못했습니다.");
    return normalizeRaw(await response.json(), "시간별 저장 데이터");
  }

  function readLocalSnapshot() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value ? normalizeRaw(JSON.parse(value), "이 브라우저의 마지막 성공 데이터") : null;
    } catch {
      return null;
    }
  }

  function saveLocalSnapshot(payload) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage can be unavailable in private browsing; the dashboard still works.
    }
  }

  function setLoading(loading) {
    state.loading = loading;
    el.refresh.disabled = loading;
    el.refresh.classList.toggle("loading", loading);
    el.refreshLabel.textContent = loading ? "새 데이터 수집 중…" : "최신 데이터 가져오기";
    el.status.classList.toggle("loading", loading);
  }

  function setStatus(message, type = "ok") {
    el.statusText.textContent = message;
    el.status.classList.toggle("error", type === "error");
  }

  function getVisibleArticles() {
    const query = state.query.trim().toLowerCase();
    const source = state.payload?.articles || [];
    const filtered = source.filter((article) => {
      const topicMatch = state.topic === "all" || article.topic === state.topic;
      const textMatch =
        !query ||
        article.title.toLowerCase().includes(query) ||
        article.author.toLowerCase().includes(query);
      return topicMatch && textMatch;
    });

    return [...filtered].sort((a, b) => {
      if (state.sort === "views") return b.views - a.views;
      if (state.sort === "comments") return b.comments - a.comments;
      if (state.sort === "latest") return new Date(b.writtenAt) - new Date(a.writtenAt);
      return a.rank - b.rank;
    });
  }

  function renderMetrics(articles) {
    const totalViews = articles.reduce((sum, article) => sum + article.views, 0);
    const totalComments = articles.reduce((sum, article) => sum + article.comments, 0);
    const top = [...articles].sort((a, b) => b.views - a.views)[0];
    el.metricCount.textContent = number.format(articles.length);
    el.metricViews.textContent = number.format(totalViews);
    el.metricComments.textContent = number.format(totalComments);
    el.metricTop.textContent = top?.title || "—";
    el.metricTopValue.textContent = top ? `조회 ${number.format(top.views)}` : "—";
  }

  function renderBrief(articles) {
    const counts = { "real-estate": 0, policy: 0, life: 0 };
    articles.forEach((article) => {
      counts[article.topic] += 1;
    });
    const mostDiscussed = [...articles].sort((a, b) => b.comments - a.comments)[0];
    el.brief.textContent = articles.length
      ? `부동산 ${counts["real-estate"]}건, 정책·정치 ${counts.policy}건, 생활·기타 ${counts.life}건입니다. 댓글 참여가 가장 큰 글은 “${mostDiscussed.title}”로 ${number.format(mostDiscussed.comments)}개의 댓글이 달렸습니다.`
      : "표시할 데이터가 없습니다.";

    el.topicBars.replaceChildren();
    Object.entries(counts).forEach(([topic, count]) => {
      const row = document.createElement("div");
      row.className = "topic-bar";
      const label = document.createElement("span");
      label.textContent = topicDefinitions[topic].label;
      const track = document.createElement("span");
      track.className = "track";
      const fill = document.createElement("span");
      fill.className = "fill";
      fill.style.width = `${articles.length ? (count / articles.length) * 100 : 0}%`;
      track.append(fill);
      const value = document.createElement("b");
      value.textContent = `${count}건`;
      row.append(label, track, value);
      el.topicBars.append(row);
    });
  }

  function renderList() {
    const articles = getVisibleArticles();
    const fragment = document.createDocumentFragment();
    articles.forEach((article) => {
      const row = el.template.content.firstElementChild.cloneNode(true);
      row.querySelector("[data-rank]").textContent = String(article.rank).padStart(2, "0");
      const title = row.querySelector("[data-title]");
      title.textContent = article.title;
      title.href = article.url;
      row.querySelector("[data-topic-label]").textContent =
        topicDefinitions[article.topic].label;
      const newBadge = row.querySelector("[data-new]");
      newBadge.hidden = !article.isNew;
      row.querySelector("[data-author]").textContent = article.author;
      const time = row.querySelector("[data-date]");
      time.textContent = dateTime.format(new Date(article.writtenAt));
      time.dateTime = article.writtenAt;
      row.querySelector("[data-views]").textContent = number.format(article.views);
      row.querySelector("[data-comments]").textContent = number.format(article.comments);
      row.querySelector("[data-likes]").textContent = number.format(article.likes);
      fragment.append(row);
    });
    el.list.replaceChildren(fragment);
    el.resultCount.textContent = `${number.format(articles.length)}개 게시글`;
    el.empty.hidden = articles.length !== 0;
  }

  function render(payload) {
    state.payload = payload;
    const articles = payload.articles.map((article, index) => ({
      ...article,
      rank: Number(article.rank || index + 1),
      topic: article.topic || classify(article.title),
    }));
    state.payload.articles = articles;
    el.fetchedAt.textContent = dateTime.format(new Date(payload.fetchedAt));
    el.fetchedAt.dateTime = payload.fetchedAt;
    el.sourceBadge.textContent = payload.sourceMode || "저장 데이터";
    el.download.disabled = false;
    renderMetrics(articles);
    renderBrief(articles);
    renderList();
  }

  async function refresh() {
    if (state.loading) return;
    setLoading(true);
    setStatus("네이버 공개 인기글에서 최신 데이터를 가져오고 있습니다.");
    try {
      const payload = await fetchLive();
      render(payload);
      saveLocalSnapshot(payload);
      setStatus(
        `새 데이터 ${payload.articleCount}건을 가져왔습니다. ${dateTime.format(new Date(payload.fetchedAt))} 기준입니다.`,
      );
    } catch (liveError) {
      try {
        const fallback = await fetchFallback();
        render(fallback);
        setStatus(
          `실시간 요청이 지연되어 ${dateTime.format(new Date(fallback.fetchedAt))} 저장 데이터를 표시합니다.`,
          "error",
        );
      } catch {
        const local = readLocalSnapshot();
        if (local) {
          render(local);
          setStatus("실시간 연결이 지연되어 이 브라우저의 마지막 성공 데이터를 표시합니다.", "error");
        } else {
          setStatus(`데이터를 가져오지 못했습니다: ${liveError.message}`, "error");
        }
      }
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!state.payload) return;
    const header = ["순위", "제목", "작성자", "작성시각", "조회", "댓글", "좋아요", "주제", "원문"];
    const rows = state.payload.articles.map((article) => [
      article.rank,
      article.title,
      article.author,
      article.writtenAt,
      article.views,
      article.comments,
      article.likes,
      topicDefinitions[article.topic].label,
      article.url,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\r\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `naver-cafe-popular-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function initialize() {
    const local = readLocalSnapshot();
    try {
      const fallback = await fetchFallback();
      const newest =
        local && new Date(local.fetchedAt) > new Date(fallback.fetchedAt)
          ? local
          : fallback;
      render(newest);
      setStatus(
        `${dateTime.format(new Date(newest.fetchedAt))} 저장 데이터를 표시합니다. 버튼을 누르면 지금 시점의 데이터로 갱신합니다.`,
      );
    } catch {
      if (local) {
        render(local);
        setStatus("이 브라우저의 마지막 성공 데이터를 표시합니다.", "error");
      } else {
        setStatus("아직 저장된 데이터가 없습니다. 최신 데이터 가져오기를 눌러주세요.", "error");
      }
    }
  }

  el.refresh.addEventListener("click", refresh);
  el.download.addEventListener("click", downloadCsv);
  el.search.addEventListener("input", () => {
    state.query = el.search.value;
    renderList();
  });
  el.sort.addEventListener("change", () => {
    state.sort = el.sort.value;
    renderList();
  });
  el.topicButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.topic = button.dataset.topic;
      el.topicButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      renderList();
    });
  });

  initialize();
})();
