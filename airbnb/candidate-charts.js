"use strict";

function listingAmounts(candidates) {
  return candidates.filter((row) =>
    Number.isFinite(row?.deposit) && row.deposit >= 0
    && Number.isFinite(row?.rent) && row.rent >= 0
  );
}

function makeListingPanel(title, rows, field) {
  const panel = document.createElement("section");
  panel.className = "chart-panel";
  const heading = document.createElement("h3");
  heading.textContent = title + " (만원)";
  const list = document.createElement("ul");
  list.className = "chart-bars";
  const maximum = Math.max(1, ...rows.map((row) => row[field]));
  const format = new Intl.NumberFormat("ko-KR");

  rows.forEach((row, index) => {
    const item = document.createElement("li");
    item.className = "chart-row";
    const label = document.createElement("span");
    label.textContent = `후보 ${row.rank ?? index + 1}`;
    const track = document.createElement("span");
    track.className = "chart-track";
    track.setAttribute("aria-hidden", "true");
    const bar = document.createElement("span");
    bar.className = "chart-bar";
    bar.style.width = `${100 * row[field] / maximum}%`;
    const value = document.createElement("strong");
    value.textContent = format.format(row[field]);
    track.append(bar);
    item.append(label, track, value);
    list.append(item);
  });

  panel.append(heading, list);
  return panel;
}

async function showListingCharts() {
  const caption = document.querySelector("#listing-chart-scope");
  try {
    const response = await fetch("./candidates.json", { cache: "no-cache" });
    if (!response.ok) throw Error("후보 데이터 응답 오류");
    const data = await response.json();
    const all = Array.isArray(data.candidates) ? data.candidates : [];
    const rows = listingAmounts(all.map((row, index) => ({ ...row, rank: index + 1 })));
    if (!rows.length) {
      caption.textContent = "보증금과 월세가 모두 있는 후보가 없습니다.";
      return;
    }
    document.querySelector("#listing-chart-panels").replaceChildren(
      makeListingPanel("보증금", rows, "deposit"),
      makeListingPanel("월세", rows, "rent"),
    );
    const date = Date.parse(data.checked_at_kst);
    const snapshot = Number.isFinite(date)
      ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(date)
      : "확인일 미기재";
    caption.textContent = `${snapshot} · 당근부동산 공개 매물 저장본 ${rows.length}/${all.length}건 · 아래 표의 순위와 같은 순서 · 두 패널은 축 범위가 다릅니다.`;
  } catch {
    caption.textContent = "매물 저장본을 불러오지 못했습니다. 아래 후보 표에서 금액을 확인할 수 있습니다.";
  }
}

showListingCharts();
