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
