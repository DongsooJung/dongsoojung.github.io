"use strict";

const $ = (id) => document.getElementById(id);
const API = "https://stargate-real-estate-api.vercel.app/api/region";
const FAVORITES_KEY = "stargate-court-auction-favorites-v1";
const VIEW_KEY = "stargate-court-auction-view-v1";
const datasets = { 주택: "data.json", 상업용: "data_commercial.json" };
const won = new Intl.NumberFormat("ko-KR");
const state = {
  category: "주택",
  records: [],
  meta: null,
  selected: null,
  dealMarket: null,
  view: localStorage.getItem(VIEW_KEY) === "table" ? "table" : "cards",
  favorites: new Set(readFavorites()),
  limit: 40,
};

const trim = (value) => Number(value.toFixed(value >= 10 ? 1 : 2)).toLocaleString("ko-KR");
const money = (value) => value >= 1e8 ? `${trim(value / 1e8)}억` : `${won.format(Math.round(value / 1e4))}만`;
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[character]));

function readFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function recordKey(record) {
  return `${record.사건번호 || ""}:${record.물건번호 || ""}`;
}

function isFavorite(record) {
  return state.favorites.has(recordKey(record));
}

function canCompare(record) {
  return Boolean(record.실거래조회지역 && /(아파트|공동주택)/.test(`${record.용도} ${record.소재지}`));
}

function daysUntil(dateValue) {
  const target = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / 86400000);
}

function dateBadge(dateValue) {
  const days = daysUntil(dateValue);
  if (!Number.isFinite(days)) return dateValue || "일정 미정";
  if (days === 0) return `D-Day · ${dateValue}`;
  if (days > 0) return `D-${days} · ${dateValue}`;
  return `기일 경과 · ${dateValue}`;
}

document.querySelectorAll("[data-cat]").forEach((button) => button.addEventListener("click", () => {
  if (state.category === button.dataset.cat) return;
  state.category = button.dataset.cat;
  state.selected = null;
  state.dealMarket = null;
  state.limit = 40;
  document.querySelectorAll("[data-cat]").forEach((item) => item.classList.toggle("on", item === button));
  renderDetails();
  renderStrategy();
  loadData();
}));

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
["search", "sido", "usage", "court", "date-range", "max-price", "max-rate", "favorite-only"].forEach((id) => {
  $(id).addEventListener(id === "search" || id === "max-price" ? "input" : "change", () => {
    state.limit = 40;
    render();
  });
});

$("filter-toggle").addEventListener("click", () => {
  const expanded = $("filter-toggle").getAttribute("aria-expanded") === "true";
  $("filter-toggle").setAttribute("aria-expanded", String(!expanded));
  $("advanced-filters").hidden = expanded;
  $("filter-toggle").textContent = expanded ? "상세 필터" : "상세 필터 닫기";
});

$("filter-reset").addEventListener("click", () => {
  ["search", "sido", "usage", "court", "date-range", "max-price", "max-rate", "favorite-only"].forEach((id) => { $(id).value = ""; });
  state.limit = 40;
  render();
});

$("load-more").addEventListener("click", () => {
  state.limit += 40;
  render();
});
$("deal-load").addEventListener("click", loadDeals);
$("deal-month").value = previousMonth();

async function loadData() {
  try {
    $("error").style.display = "none";
    const response = await fetch(`${datasets[state.category]}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw Error(`데이터 파일 HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.meta?.is_sample || String(payload.meta?.source || "").includes("샘플")) {
      throw Error("샘플 데이터가 감지되어 표시를 중단했습니다. 실제 법원 수집기를 실행해 주세요.");
    }
    state.records = payload.records || [];
    state.meta = payload.meta || {};
    fillFilters();
    syncMeta();
    render();
  } catch (error) {
    $("error").textContent = `실제 경매 데이터를 불러오지 못했습니다: ${error.message}`;
    $("error").style.display = "block";
    state.records = [];
    render();
  }
}

function fillFilters() {
  const selections = { sido: $("sido").value, usage: $("usage").value, court: $("court").value };
  setOptions("sido", [...new Set(state.records.map((record) => record.시도).filter(Boolean))].sort(), "전국");
  setOptions("usage", [...new Set(state.records.map((record) => record.용도).filter(Boolean))].sort(), "전체 용도");
  setOptions("court", [...new Set(state.records.map((record) => record.법원).filter(Boolean))].sort(), "전체 법원");
  Object.entries(selections).forEach(([id, value]) => { $(id).value = value; });
}

function setOptions(id, values, firstLabel) {
  const element = $(id);
  element.replaceChildren(new Option(firstLabel, ""));
  values.forEach((value) => element.append(new Option(value, value)));
}

function syncMeta() {
  $("live-chip").textContent = "● 법원 원문 파싱 데이터";
  $("generated-chip").textContent = `수집 ${formatDateTime(state.meta.generated_at)}`;
  $("source-chip").textContent = `공고 ${won.format(state.meta.notice_count || 0)}건 파싱`;
  $("footer").textContent = `출처: ${state.meta.source} · 국토교통부 아파트 매매 실거래가 · 기준: ${state.meta.basis || "매각기일"} · 본 화면은 참고용이며 입찰 전 원문을 확인해야 합니다.`;
}

function filtered() {
  const query = $("search").value.trim().toLowerCase();
  const sido = $("sido").value;
  const usage = $("usage").value;
  const court = $("court").value;
  const dateRange = Number($("date-range").value || 0);
  const maxPrice = Number($("max-price").value || 0) * 10000;
  const maxRate = Number($("max-rate").value || 0);
  const favoriteOnly = $("favorite-only").value === "1";

  return state.records.filter((record) => {
    const days = daysUntil(record.매각기일);
    return (!sido || record.시도 === sido)
      && (!usage || record.용도 === usage)
      && (!court || record.법원 === court)
      && (!dateRange || (days >= 0 && days <= dateRange))
      && (!maxPrice || Number(record.최저매각가) <= maxPrice)
      && (!maxRate || Number(record.최저가율) <= maxRate)
      && (!favoriteOnly || isFavorite(record))
      && (!query || [record.사건번호, record.법원, record.담당계, record.소재지, record.용도]
        .some((value) => String(value).toLowerCase().includes(query)));
  });
}

function render() {
  const records = filtered();
  renderMetrics(records);
  renderScope(records);
  renderCards(records);
  renderTable(records);
  bindResultActions();
  renderView();
  $("table-caption").textContent = `${state.category} ${won.format(records.length)}건`;
  $("favorite-summary").textContent = `관심 ${won.format(state.favorites.size)}건`;
}

function renderMetrics(records) {
  const withinWeek = records.filter((record) => {
    const days = daysUntil(record.매각기일);
    return days >= 0 && days <= 7;
  }).length;
  const deepDiscount = records.filter((record) => Number(record.최저가율) <= 64).length;
  $("m-count").textContent = `${won.format(records.length)}건`;
  $("m-week").textContent = `${won.format(withinWeek)}건`;
  $("m-appraisal").textContent = records.length ? money(avg(records, "감정가")) : "—";
  $("m-minimum").textContent = records.length ? money(avg(records, "최저매각가")) : "—";
  $("m-rate").textContent = records.length ? `${trim(avg(records, "최저가율"))}%` : "—";
  $("m-deep").textContent = `${won.format(deepDiscount)}건`;
}

function renderScope(records) {
  const location = $("sido").value || "전국";
  const usage = $("usage").value || state.category;
  const schedule = $("date-range").value ? `${$("date-range").value}일 이내` : "모든 일정";
  $("result-scope").innerHTML = `<b>${safe(location)} · ${safe(usage)}</b> · ${safe(schedule)} · 현재 필터 ${won.format(records.length)}건`;
}

function renderCards(records) {
  const visible = records.slice(0, state.limit);
  $("card-empty").hidden = records.length > 0;
  $("cards").innerHTML = visible.map((record) => {
    const index = state.records.indexOf(record);
    const favorite = isFavorite(record);
    const comparable = canCompare(record);
    return `<article class="auction-card" data-select="${index}" tabindex="0">
      <button class="favorite-btn ${favorite ? "on" : ""}" type="button" data-favorite="${index}" aria-label="${favorite ? "관심 물건에서 삭제" : "관심 물건으로 저장"}" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button>
      <div class="card-top"><span class="card-date">${safe(dateBadge(record.매각기일))}</span><span class="card-court">${safe(record.법원)}</span></div>
      <h3 class="card-title">${safe(record.사건번호)} · ${safe(record.물건번호)}번</h3>
      <p class="card-address">${safe(record.소재지)}</p>
      <div class="card-price"><div><span>감정가</span><strong>${money(Number(record.감정가))}</strong></div><div><span>최저가</span><strong>${money(Number(record.최저매각가))}</strong></div><span class="discount-badge">${safe(record.최저가율)}%</span></div>
      <div class="card-actions"><span class="type-badge">${safe(record.용도)}</span><button type="button" data-select-button="${index}">검토</button>${comparable ? `<button type="button" data-compare="${index}">실거래</button>` : ""}</div>
    </article>`;
  }).join("");
  $("load-more").hidden = visible.length >= records.length;
}

function renderTable(records) {
  $("empty").hidden = records.length > 0;
  $("rows").innerHTML = records.map((record) => {
    const index = state.records.indexOf(record);
    const favorite = isFavorite(record);
    const comparable = canCompare(record);
    return `<tr>
      <td><button class="favorite-btn table-favorite ${favorite ? "on" : ""}" type="button" data-favorite="${index}" aria-label="${favorite ? "관심 물건에서 삭제" : "관심 물건으로 저장"}" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button></td>
      <td>${safe(record.매각기일)}</td><td><b>${safe(record.사건번호)}</b><br><small>${safe(record.물건번호)}번</small></td>
      <td>${safe(record.법원)}<br><small>${safe(record.담당계)}</small></td><td>${safe(record.용도)}</td><td class="address">${safe(record.소재지)}</td>
      <td class="money">${won.format(record.감정가)}원</td><td class="money"><b>${won.format(record.최저매각가)}원</b><br><span class="rate">${safe(record.최저가율)}%</span></td>
      <td><button class="compare-btn" type="button" data-select-button="${index}">검토</button>${comparable ? `<button class="compare-btn" type="button" data-compare="${index}">실거래</button>` : ""}</td>
    </tr>`;
  }).join("");
}

function bindResultActions() {
  document.querySelectorAll("[data-favorite]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFavorite(Number(button.dataset.favorite));
  }));
  document.querySelectorAll("[data-select-button]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    selectRecord(Number(button.dataset.selectButton), false);
  }));
  document.querySelectorAll("[data-compare]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    selectRecord(Number(button.dataset.compare), true);
  }));
  document.querySelectorAll("[data-select]").forEach((card) => {
    card.addEventListener("click", () => selectRecord(Number(card.dataset.select), false));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectRecord(Number(card.dataset.select), false);
      }
    });
  });
}

function renderView() {
  $("card-wrap").hidden = state.view !== "cards";
  $("table-wrap").hidden = state.view !== "table";
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("on", button.dataset.view === state.view));
}

function setView(view) {
  state.view = view === "table" ? "table" : "cards";
  localStorage.setItem(VIEW_KEY, state.view);
  renderView();
}

function toggleFavorite(index) {
  const record = state.records[index];
  if (!record) return;
  const key = recordKey(record);
  if (state.favorites.has(key)) state.favorites.delete(key);
  else state.favorites.add(key);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  render();
  if (state.selected && recordKey(state.selected) === key) renderDetails();
}

function selectRecord(index, focusDeals) {
  state.selected = state.records[index];
  if (!state.selected) return;
  state.dealMarket = null;
  renderDetails();
  renderStrategy();
  if (canCompare(state.selected)) {
    $("deal-region").value = state.selected.실거래조회지역;
    $("selected").innerHTML = `<b>${safe(state.selected.사건번호)} · ${safe(state.selected.용도)}</b><span>${safe(state.selected.실거래조회지역)}<br>최저가 ${won.format(state.selected.최저매각가)}원 (${safe(state.selected.최저가율)}%)</span>`;
    $("compare-result").innerHTML = '<div class="message">거래월을 확인하고 조회를 누르세요.</div>';
  }
  if (innerWidth < 901 || focusDeals) $("detail-content").scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderDetails() {
  if (!state.selected) {
    $("detail-content").innerHTML = '<div class="detail-empty">검토할 물건을 선택하세요.</div>';
    return;
  }
  const record = state.selected;
  const index = state.records.indexOf(record);
  const favorite = isFavorite(record);
  $("detail-content").innerHTML = `<div class="selection-title"><b>${safe(record.사건번호)} · ${safe(record.물건번호)}번</b></div>
    <p class="detail-address">${safe(record.소재지)}</p>
    <div class="detail-grid"><div><span>매각기일</span><strong>${safe(dateBadge(record.매각기일))}</strong></div><div><span>법원·담당계</span><strong>${safe(record.법원)} · ${safe(record.담당계)}</strong></div><div><span>감정가</span><strong>${money(Number(record.감정가))}</strong></div><div><span>최저가</span><strong>${money(Number(record.최저매각가))} · ${safe(record.최저가율)}%</strong></div><div><span>입찰시간</span><strong>${safe(record.입찰시간 || "확인 필요")}</strong></div><div><span>매각장소</span><strong>${safe(record.매각장소 || "법원 확인")}</strong></div></div>
    ${record.비고 ? `<p class="detail-address"><b>비고</b><br>${safe(record.비고)}</p>` : ""}
    <div class="detail-actions"><button type="button" data-detail-favorite="${index}">${favorite ? "★ 관심 해제" : "☆ 관심 저장"}</button><a class="compare-btn" href="#bid-strategy">입찰 전략 검토</a><a class="compare-btn" href="https://www.courtauction.go.kr/" target="_blank" rel="noopener noreferrer">법원 원문 ↗</a></div>`;
  document.querySelector("[data-detail-favorite]").addEventListener("click", () => toggleFavorite(index));
}

async function loadDeals() {
  const query = $("deal-region").value.trim();
  const dealMonth = $("deal-month").value.replace("-", "");
  if (!query || !/^\d{6}$/.test(dealMonth)) return;
  state.dealMarket = null;
  renderStrategy();
  $("deal-load").disabled = true;
  $("compare-result").innerHTML = '<div class="loading">VWorld 법정동 해석 → 국토부 실거래 조회 중…</div>';
  try {
    const response = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, dealMonth, offset: 0, limit: 100 }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw Error(payload?.error || `HTTP ${response.status}`);
    state.dealMarket = payload.totals.averagePrice ? {
      amount: Number(payload.totals.averagePrice),
      label: `${query} · ${dealMonth.slice(0, 4)}년 ${Number(dealMonth.slice(4))}월`,
    } : null;
    renderStrategy();
    const average = payload.totals.averagePrice ? `${money(payload.totals.averagePrice * 1e4)}원` : "—";
    const hasAuction = state.selected && state.selected.실거래조회지역 === query;
    const gap = hasAuction && payload.totals.averagePrice ? state.selected.최저매각가 - payload.totals.averagePrice * 1e4 : null;
    const auction = hasAuction ? `<div><span>경매 최저가</span><strong>${money(state.selected.최저매각가)}원</strong></div><div><span>평균 대비 차이</span><strong>${gap === null ? "—" : `${gap >= 0 ? "+" : ""}${money(gap)}원`}</strong></div>` : "";
    $("selected").innerHTML = `<b>${safe(payload.resolution.legalDongFullName)}</b><span>법정동 코드 ${safe(payload.resolution.legalDongCode)} · ${dealMonth.slice(0, 4)}년 ${Number(dealMonth.slice(4))}월</span>`;
    $("compare-result").innerHTML = `<div class="deal-summary"><div><span>법정동 월 거래</span><strong>${won.format(payload.totals.legalDong)}건</strong></div><div><span>평균 실거래가</span><strong>${average}</strong></div>${auction}</div><div class="deals">${payload.rows.slice(0, 8).map((item) => `<div class="deal"><b><span>${safe(item.deal_date)}</span><em>${money(item.price_manwon * 1e4)}원</em></b><span>${safe(item.apartment_name)} · ${safe(item.area_sqm)}㎡ · ${safe(item.floor)}층</span></div>`).join("") || '<div class="message">해당 월 신고 거래가 없습니다.</div>'}</div>`;
  } catch (error) {
    $("compare-result").innerHTML = `<div class="message">실거래 조회 실패: ${safe(error.message)}<br>지역명을 시·군·구와 읍·면·동까지 입력해 주세요.</div>`;
  } finally {
    $("deal-load").disabled = false;
  }
}

function strategyNumber(id) {
  return Math.max(0, Number($(id).value) || 0);
}

function strategyMoney(manwon) {
  return `${money(manwon * 1e4)}원`;
}

function renderStrategy() {
  const exit = strategyNumber("strategy-exit");
  const margin = Math.min(80, strategyNumber("strategy-margin"));
  const acquisition = strategyNumber("strategy-acquisition");
  const operation = strategyNumber("strategy-operation");
  const buffer = strategyNumber("strategy-buffer");
  const costs = acquisition + operation + buffer;
  const maxBid = exit ? Math.max(0, exit * (1 - margin / 100) - costs) : 0;
  $("strategy-max-bid").textContent = exit ? strategyMoney(maxBid) : "—";
  $("strategy-cost-total").textContent = costs ? strategyMoney(costs) : "0원";
  const selectedMinimum = state.selected ? Number(state.selected.최저매각가 || 0) / 1e4 : 0;
  if (!exit) {
    $("strategy-gap").textContent = state.selected ? "예상 매각가 필요" : "물건 선택 필요";
    $("strategy-price-note").textContent = "예상 매각가를 입력하거나 실거래 평균을 반영해 계산을 시작하세요.";
  } else if (selectedMinimum) {
    const gap = maxBid - selectedMinimum;
    $("strategy-gap").textContent = `${gap >= 0 ? "+" : "−"}${strategyMoney(Math.abs(gap))}`;
    $("strategy-price-note").textContent = gap >= 0 ? "현재 최저가가 내부 검토 상한 이내입니다. 권리·점유·자금 게이트를 모두 통과하기 전에는 입찰하지 마세요." : "현재 최저가가 내부 검토 상한을 초과합니다. 예상 매각가·비용·권리조건을 다시 검토하세요.";
  } else {
    $("strategy-gap").textContent = "물건 선택 필요";
    $("strategy-price-note").textContent = "목록에서 물건을 선택하면 해당 최저가와 내부 검토 상한의 차이를 표시합니다.";
  }
  const market = state.dealMarket;
  $("strategy-use-market").disabled = !(market && market.amount > 0);
  $("strategy-market-note").textContent = market && market.amount > 0 ? `최근 조회 ${market.label} 평균 ${strategyMoney(market.amount)} · 반영 전에는 물건별 면적·층·상태를 별도 보정하세요.` : "실거래 비교를 조회하면 평균가를 계산에 반영할 수 있습니다.";
  const gates = [...document.querySelectorAll("[data-gate]")];
  const checked = gates.filter((item) => item.checked).length;
  const percent = gates.length ? Math.round(checked / gates.length * 100) : 0;
  gates.forEach((item) => item.closest(".check-item").classList.toggle("checked", item.checked));
  $("gate-count").textContent = `${checked} / ${gates.length} 확인`;
  $("gate-bar").style.width = `${percent}%`;
  const status = $("strategy-status");
  if (checked === gates.length) {
    status.className = "strategy-status is-go";
    status.textContent = "게이트 충족 · 최종 검토 필요";
  } else if (checked >= 3) {
    status.className = "strategy-status is-review";
    status.textContent = "일부 확인 · 조건부 재검토";
  } else {
    status.className = "strategy-status is-hold";
    status.textContent = "필수 확인 전 · 입찰 보류";
  }
}

function useMarketEstimate() {
  if (!(state.dealMarket && state.dealMarket.amount > 0)) return;
  $("strategy-exit").value = Math.round(state.dealMarket.amount);
  renderStrategy();
}

function initStrategy() {
  ["strategy-exit", "strategy-margin", "strategy-acquisition", "strategy-operation", "strategy-buffer"].forEach((id) => $(id).addEventListener("input", renderStrategy));
  $("strategy-use-market").addEventListener("click", useMarketEstimate);
  document.querySelectorAll("[data-gate]").forEach((item) => item.addEventListener("change", renderStrategy));
  renderStrategy();
}

function avg(records, key) {
  return records.reduce((sum, record) => sum + (Number(record[key]) || 0), 0) / records.length;
}

function previousMonth() {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

document.querySelector(".layout").after($("bid-strategy"));
initStrategy();
renderDetails();
setView(state.view);
loadData();
