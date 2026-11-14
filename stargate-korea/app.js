(() => {
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const formatKst = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  const card = (item) => `
    <article class="card ${item.gap ? "gap" : ""}">
      <div class="kicker">${escapeHtml(item.kicker)}</div>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.body)}</p>
      ${item.price ? `<span class="price">${escapeHtml(item.price)}</span>` : ""}
      <div class="meta"><span>${escapeHtml(item.meta)}</span><b><a href="${escapeHtml(item.href)}" rel="noopener">${escapeHtml(item.cta)}</a></b></div>
    </article>`;

  fetch("./data/feed.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      $('[data-metric="posts"]').textContent = String(data.postCount ?? 0);
      $('[data-metric="covered"]').textContent =
        `${data.coverage?.coveredCustomers ?? 0}/${data.coverage?.totalCustomers ?? 0}`;
      $('[data-metric="gaps"]').textContent = String(data.drafts?.length ?? 0);
      $('[data-metric="updated"]').textContent = formatKst(data.fetchedAt);
      $("[data-status]").textContent =
        `${data.channel?.title || "Stargate Korea"} 공개 피드 · ${data.sourceUrl}`;

      $("[data-products]").innerHTML = (data.products || []).map((product) => card({
        kicker: product.id,
        title: product.nameKo || product.name,
        body: product.job,
        price: product.price,
        meta: product.name,
        href: product.href,
        cta: "상품 열기 ↗",
      })).join("");

      $("[data-posts]").innerHTML = (data.posts || []).map((post) => card({
        kicker: post.category || "English",
        title: post.title,
        body: post.excerpt,
        meta: (post.customerNames || []).join(" · ") || "고객 미매칭",
        href: post.link,
        cta: "원문 ↗",
      })).join("");

      $("[data-customers]").innerHTML = (data.customers || []).map((customer) => card({
        gap: !customer.covered,
        kicker: customer.covered ? `${customer.category} · covered` : `${customer.category} · gap`,
        title: customer.nameKo,
        body: customer.job,
        meta: customer.covered
          ? `${customer.postCount} posts · ${customer.latestPost?.title || ""}`
          : "다음 초안 대기",
        href: customer.offer?.href || "https://www.stargatekorea.net/",
        cta: customer.offer?.name || "상품 ↗",
      })).join("");

      $("[data-drafts]").innerHTML = (data.drafts || []).map((draft) => card({
        gap: true,
        kicker: `${draft.category} · ${draft.reason}`,
        title: draft.title,
        body: `${draft.pain} → ${draft.outcome}`,
        meta: draft.nameKo,
        href: draft.offer?.href || "https://www.stargatekorea.net/#plan",
        cta: draft.offer?.name || "플래너",
      })).join("") || "<p class=\"note\">모든 고객 세그먼트가 최근 글로 커버되어 있습니다.</p>";
    })
    .catch((error) => {
      $("[data-status]").textContent = `스냅샷을 읽지 못했습니다. ${error.message}`;
    });
})();
