(() => {
  "use strict";

  const STORAGE_KEY = "stargate-theme";
  const root = document.documentElement;
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: light)");

  const readSavedTheme = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "light" || saved === "dark" ? saved : null;
    } catch (_) {
      return null;
    }
  };

  const preferredTheme = () => readSavedTheme() || (systemTheme?.matches ? "light" : "dark");

  const updateThemeColor = (theme) => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f6f8fc" : "#0b1020";
  };

  const updateToggle = (toggle, theme) => {
    if (!toggle) return;
    const toLight = theme === "dark";
    const nextLabel = toLight ? "화이트" : "다크";
    const icon = toggle.querySelector(".sg-theme-toggle__icon");
    const label = toggle.querySelector(".sg-theme-toggle__label");

    if (icon) icon.textContent = toLight ? "☀️" : "🌙";
    if (label) label.textContent = nextLabel;
    toggle.setAttribute("aria-label", `${nextLabel} 모드로 전환`);
    toggle.setAttribute("aria-pressed", String(theme === "light"));
    toggle.title = `${nextLabel} 모드로 전환`;
  };

  const applyTheme = (theme, { persist = false, announce = false } = {}) => {
    const current = theme === "light" ? "light" : "dark";
    root.dataset.theme = current;
    root.style.colorScheme = current;
    updateThemeColor(current);
    updateToggle(document.querySelector(".sg-theme-toggle"), current);

    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, current);
      } catch (_) {}
    }

    window.dispatchEvent(new CustomEvent("stargate-theme-change", {
      detail: { theme: current, announce }
    }));
  };

  /* Runs in <head> so the saved theme is applied before the page paints. */
  applyTheme(preferredTheme());

  const mountToggle = () => {
    if (document.querySelector(".sg-theme-toggle, #theme-toggle")) return;

    const toggle = document.createElement("button");
    toggle.className = "sg-theme-toggle";
    toggle.type = "button";
    toggle.innerHTML = [
      '<span class="sg-theme-toggle__icon" aria-hidden="true"></span>',
      '<span class="sg-theme-toggle__label"></span>'
    ].join("");
    toggle.addEventListener("click", () => {
      applyTheme(root.dataset.theme === "light" ? "dark" : "light", {
        persist: true,
        announce: true
      });
    });

    document.body.append(toggle);
    updateToggle(toggle, root.dataset.theme);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle, { once: true });
  } else {
    mountToggle();
  }

  systemTheme?.addEventListener?.("change", (event) => {
    if (!readSavedTheme()) applyTheme(event.matches ? "light" : "dark");
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) applyTheme(preferredTheme());
  });
})();

(() => {
  "use strict";

  const mountKoiSample = () => {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/koi-coach") return;

    const grid = document.querySelector(".feat-grid");
    if (!grid || document.querySelector('[data-koi-middle-sample]')) return;

    const card = document.createElement("a");
    card.className = "feat";
    card.dataset.koiMiddleSample = "";
    card.href = "/koi-coach/middle-prelim-sample/";
    card.style.display = "block";
    card.style.color = "inherit";
    card.style.textDecoration = "none";
    card.innerHTML = [
      '<div class="icon">💻</div>',
      '<h3>중등부 지역예선형 실전 샘플</h3>',
      '<p>정렬·구간 개수·이분 탐색으로 O(N²) 풀이를 O(N log N)으로 개선합니다. 문제 → 힌트 → 설계 → C++20 → 인터랙티브 검증까지 한 문제로 공개합니다.</p>',
      '<span class="status" style="color:var(--good);border-color:rgba(99,214,160,.30);background:rgba(99,214,160,.10)">✓ 샘플 1문제 공개</span>'
    ].join("");
    grid.insertBefore(card, grid.firstElementChild);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountKoiSample, { once: true });
  } else {
    mountKoiSample();
  }
})();
