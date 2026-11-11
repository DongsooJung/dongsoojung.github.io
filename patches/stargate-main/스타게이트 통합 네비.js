/* ============================================================
   STARGATE 통합 네비게이션 — JS 자동 주입 컴포넌트
   각 사이트 <body> 시작 직후 또는 끝부분에 다음 한 줄만 추가:
     <script src="/스타게이트 통합 네비.js" data-site="main"></script>
   data-site 값: "main" | "blog" | "shop" | "edushop"
   ============================================================ */

(function () {
  // ── 사이트 정의 ──
  const SITES = {
    main: {
      name: "스타게이트 본사",
      url: "https://portal.stargateedu.co.kr",
      label: "본사",
      tag: "STARGATE HQ",
    },
    blog: {
      name: "스타게이트 블로그",
      url: "https://blog.stargateedu.co.kr",
      label: "블로그",
      tag: "STARGATE BLOG",
    },
    shop: {
      name: "스타게이트 쇼핑몰",
      url: "https://shop.stargateedu.co.kr",
      label: "쇼핑몰",
      tag: "STARGATE SHOP",
    },
    edushop: {
      name: "스타게이트 에듀 스토어",
      url: "https://shop.stargateedu.co.kr",
      label: "에듀 스토어",
      tag: "STARGATE EDU SHOP",
    },
  };

  // ── 현재 사이트 키 ──
  const currentScript = document.currentScript;
  const current = (currentScript && currentScript.dataset.site) || detectSite();

  function detectSite() {
    const h = location.hostname;
    if (h.startsWith("blog.")) return "blog";
    if (h.startsWith("shop.stargateedu")) return "edushop";
    if (h.includes("stargateshop")) return "shop";
    return "main";
  }

  // ── 헤더 HTML 생성 ──
  function buildHeader() {
    const links = Object.entries(SITES)
      .map(([key, s]) => {
        const active = key === current ? " is-active" : "";
        return `<a class="sg-nav__link${active}" href="${s.url}" rel="noopener">
          <span class="sg-nav__dot"></span>${s.label}
        </a>`;
      })
      .join("");

    return `
<header class="sg-header">
  <div class="sg-header__inner">
    <a class="sg-brand" href="${SITES[current].url}">
      <span class="sg-brand__mark">★</span>
      <span>STARGATE<span class="sg-brand__sub">주식회사 별의문</span></span>
    </a>
    <nav class="sg-nav" aria-label="스타게이트 통합 메뉴">
      ${links}
    </nav>
  </div>
</header>`;
  }

  // ── Cross-link 박스 ──
  function buildCrossLinks() {
    const items = Object.entries(SITES)
      .map(([key, s]) => {
        const cur = key === current ? " is-current" : "";
        const label = key === current ? "(현재 페이지)" : "바로가기 →";
        return `<a class="sg-cross__item${cur}" href="${s.url}" rel="noopener">
          <div class="sg-cross__name">${s.name} <small style="opacity:.6;font-weight:400">${label}</small></div>
          <div class="sg-cross__url">${s.url.replace("https://", "")}</div>
        </a>`;
      })
      .join("");

    return `
<section class="sg-cross" aria-label="스타게이트 패밀리 사이트">
  <div class="sg-cross__title">★ STARGATE 패밀리 사이트</div>
  <div class="sg-cross__grid">${items}</div>
</section>`;
  }

  // ── Footer ──
  function buildFooter() {
    const linksFooter = Object.values(SITES)
      .map((s) => `<a href="${s.url}" rel="noopener">${s.name}</a>`)
      .join("");

    return `
<footer class="sg-footer">
  <div class="sg-footer__inner">
    <div class="sg-footer__col">
      <h4>주식회사 별의문 (Stargate Corporation)</h4>
      <p style="margin:4px 0;line-height:1.7">
        대표 정동수 | 서울특별시 강남구 강남대로112길 47<br>
        <a href="mailto:ceo@stargateedu.co.kr">ceo@stargateedu.co.kr</a>
      </p>
    </div>
    <div class="sg-footer__col">
      <h4>패밀리 사이트</h4>
      ${linksFooter}
    </div>
    <div class="sg-footer__col">
      <h4>사업영역</h4>
      <a href="${SITES.main.url}/procurement-center.html">입찰 준비센터</a>
      <a href="https://stargateedu.co.kr/cybersecurity/">AI 사이버 보안</a>
      <a href="${SITES.main.url}">AI · 공간계량</a>
      <a href="${SITES.main.url}/monetization.html">수익화 전략</a>
      <a href="${SITES.shop.url}">디지털 상품</a>
      <a href="${SITES.edushop.url}">교육 스토어</a>
      <a href="${SITES.blog.url}">연구 블로그</a>
    </div>
    <div class="sg-footer__col">
      <h4>운영</h4>
      <a href="${SITES.main.url}/이용약관.html">이용약관</a>
      <a href="${SITES.main.url}/개인정보처리방침.html">개인정보처리방침</a>
      <a href="${SITES.main.url}/환불규정.html">환불규정</a>
      <a href="mailto:ceo@stargateedu.co.kr">고객지원</a>
    </div>
  </div>
  <div class="sg-footer__bottom">
    <span>© 2026 Stargate Corporation. All rights reserved.</span>
    <span>주식회사 별의문 · 사업자등록번호 848-86-03835</span>
  </div>
</footer>`;
  }

  // ── DOM 주입 ──
  function inject() {
    // Header → body 최상단 prepend
    const header = document.createElement("div");
    header.innerHTML = buildHeader();
    document.body.prepend(header.firstElementChild);

    // Cross-link → main 끝 또는 footer 직전
    const crossWrap = document.createElement("div");
    crossWrap.innerHTML = buildCrossLinks();
    const main = document.querySelector("main") || document.body;
    main.appendChild(crossWrap.firstElementChild);

    // Footer → body 끝
    const footer = document.createElement("div");
    footer.innerHTML = buildFooter();
    document.body.appendChild(footer.firstElementChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
