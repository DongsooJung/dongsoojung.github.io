(() => {
  window.REGION_DASHBOARD_V2 = true;

  const REGION_API =
    "https://stargate-real-estate-api.vercel.app/api/region";
  const state = {
    summary: null,
    baseLegalDongs: null,
    legalDongs: null,
    region: null,
    mode: "hwaseong",
    rows: [],
    offset: 0,
    filter: "전체",
    selectedDong: null,
    loading: false,
  };
  const $ = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat("ko-KR");
  const decimal = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 1,
  });
  const districtPalette = [
    "#d46a45",
    "#5f8d65",
    "#5d78bd",
    "#7858a6",
    "#b07b3c",
    "#3f8f91",
  ];
  const knownDistrictColors = {
    만세구: "#d46a45",
    효행구: "#5f8d65",
    병점구: "#5d78bd",
    동탄구: "#7858a6",
  };
  const safe = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  const wonLabel = (value) => {
    const eok = Math.floor(value / 10000);
    const rest = value % 10000;
    return eok
      ? rest
        ? `${eok}억 ${money.format(rest)}만`
        : `${eok}억`
      : `${money.format(value)}만`;
  };
  const dateLabel = (value) => {
    const parts = value.split("-");
    return `${Number(parts[1])}.${String(Number(parts[2])).padStart(2, "0")}`;
  };
  const csvEscape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rowDong = (row) => row.neighborhood.split(" ")[0];
  const dongKey = (district, name) => `${district}|${name}`;
  const dealMonthLabel = (value) =>
    `${String(value).slice(0, 4)}-${String(value).slice(4, 6)}`;

  function districtColor(name) {
    if (knownDistrictColors[name]) return knownDistrictColors[name];
    const hash = [...name].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    );
    return districtPalette[hash % districtPalette.length];
  }

  function stats(rows) {
    if (!rows.length) return { average: 0, median: 0, top: null };
    const prices = rows
      .map((row) => row.price_manwon)
      .sort((a, b) => a - b);
    const middle = Math.floor(prices.length / 2);
    return {
      average: Math.round(
        rows.reduce((sum, row) => sum + row.price_manwon, 0) / rows.length,
      ),
      median:
        prices.length % 2
          ? prices[middle]
          : Math.round((prices[middle - 1] + prices[middle]) / 2),
      top: rows.reduce((best, row) =>
        row.price_manwon > best.price_manwon ? row : best,
      ),
    };
  }

  function filteredRows() {
    return state.rows.filter((row) => {
      const districtMatch =
        state.filter === "전체" || row.district_name === state.filter;
      const dongMatch =
        !state.selectedDong ||
        dongKey(row.district_name, rowDong(row)) === state.selectedDong;
      return districtMatch && dongMatch;
    });
  }

  function renderFilters() {
    const mappedDistricts =
      state.legalDongs?.features.map(
        (feature) => feature.properties.district,
      ) || state.rows.map((row) => row.district_name);
    const districts = ["전체", ...new Set(mappedDistricts.filter(Boolean))];
    $("filters").innerHTML = districts
      .map(
        (name) =>
          `<button type="button" data-district="${safe(name)}" class="${
            name === state.filter ? "active" : ""
          }">${safe(name)}</button>`,
      )
      .join("");
    $("filters")
      .querySelectorAll("button")
      .forEach((button) =>
        button.addEventListener("click", () => {
          state.filter = button.dataset.district;
          state.selectedDong = null;
          render();
        }),
      );
  }

  function renderMap() {
    if (!state.legalDongs?.features?.length) return;
    const features = state.legalDongs.features;
    const counts = new Map();
    state.rows.forEach((row) => {
      const key = dongKey(row.district_name, rowDong(row));
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    const points = [];
    const collect = (value) => {
      if (typeof value?.[0] === "number") points.push(value);
      else value?.forEach(collect);
    };
    features.forEach((feature) => collect(feature.geometry.coordinates));
    const meanLat =
      points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const cosLat = Math.cos((meanLat * Math.PI) / 180);
    const bounds = points.reduce(
      (result, point) => {
        const x = point[0] * cosLat;
        return {
          minX: Math.min(result.minX, x),
          maxX: Math.max(result.maxX, x),
          minY: Math.min(result.minY, point[1]),
          maxY: Math.max(result.maxY, point[1]),
        };
      },
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
      },
    );
    const width = 1000;
    const height = 620;
    const pad = 30;
    const scale = Math.min(
      (width - pad * 2) / (bounds.maxX - bounds.minX),
      (height - pad * 2) / (bounds.maxY - bounds.minY),
    );
    const project = (point) => [
      pad + (point[0] * cosLat - bounds.minX) * scale,
      height - pad - (point[1] - bounds.minY) * scale,
    ];
    const ringPath = (ring) =>
      `${ring
        .map(
          (point, index) =>
            `${index ? "L" : "M"}${project(point)
              .map((value) => value.toFixed(1))
              .join(",")}`,
        )
        .join(" ")} Z`;
    const geometryPath = (geometry) => {
      if (geometry.type === "Polygon") {
        return geometry.coordinates.map(ringPath).join(" ");
      }
      return geometry.coordinates
        .flatMap((polygon) => polygon.map(ringPath))
        .join(" ");
    };
    const fillFor = (count) =>
      count >= 6
        ? "#193c29"
        : count >= 3
          ? "#84b85d"
          : count >= 1
            ? "#d9ff43"
            : "#dedbd1";

    $("legal-map").innerHTML = features
      .map((feature) => {
        const { district, name, fullName } = feature.properties;
        const key = dongKey(district, name);
        const count = counts.get(key) || 0;
        const muted =
          (state.filter !== "전체" && state.filter !== district) ||
          (state.selectedDong && state.selectedDong !== key);
        return `<path d="${geometryPath(feature.geometry)}" fill="${fillFor(
          count,
        )}" fill-rule="evenodd"
          class="${muted ? "is-muted " : ""}${
            state.selectedDong === key ? "is-selected" : ""
          }"
          data-key="${safe(key)}" data-district="${safe(
            district,
          )}" data-name="${safe(name)}" data-full-name="${safe(
            fullName || `${district} ${name}`,
          )}" data-count="${count}"
          tabindex="0" role="button" aria-label="${safe(district)} ${safe(
            name,
          )}, 현재 ${count}건"></path>`;
      })
      .join("");

    const tooltip = $("map-tooltip");
    const canvas = $("map-canvas");
    const showTooltip = (path, event) => {
      tooltip.innerHTML = `<b>${safe(path.dataset.name)}</b>${safe(
        path.dataset.district,
      )} · 현재 ${money.format(Number(path.dataset.count))}건`;
      tooltip.hidden = false;
      const box = canvas.getBoundingClientRect();
      const pathBox = path.getBoundingClientRect();
      const x = event?.clientX ?? pathBox.left + pathBox.width / 2;
      const y = event?.clientY ?? pathBox.top + pathBox.height / 2;
      tooltip.style.left = `${Math.min(
        box.width - 185,
        Math.max(5, x - box.left),
      )}px`;
      tooltip.style.top = `${Math.min(
        box.height - 35,
        Math.max(35, y - box.top),
      )}px`;
    };
    $("legal-map")
      .querySelectorAll("path")
      .forEach((path) => {
        path.addEventListener("pointermove", (event) =>
          showTooltip(path, event),
        );
        path.addEventListener("pointerleave", () => {
          tooltip.hidden = true;
        });
        path.addEventListener("focus", () => showTooltip(path));
        path.addEventListener("blur", () => {
          tooltip.hidden = true;
        });
        path.addEventListener("click", () => {
          const currentRegionKey = state.region
            ? dongKey(
                state.region.resolution.districtName,
                state.region.resolution.legalDongName,
              )
            : "";
          if (
            state.mode === "region" &&
            path.dataset.key !== currentRegionKey
          ) {
            $("region-input").value = path.dataset.fullName;
            loadRegion(
              path.dataset.fullName,
              $("region-month").value.replace("-", ""),
              0,
              true,
            );
            return;
          }
          state.filter = path.dataset.district;
          state.selectedDong = path.dataset.key;
          render();
          document
            .querySelector(".data-section")
            .scrollIntoView({ behavior: "smooth", block: "start" });
        });
        path.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            path.click();
          }
        });
      });

    const preferred = ["만세구", "효행구", "병점구", "동탄구"];
    const discovered = [
      ...new Set(
        features.map((feature) => feature.properties.district).filter(Boolean),
      ),
    ];
    const districts = [
      ...preferred.filter((district) => discovered.includes(district)),
      ...discovered.filter((district) => !preferred.includes(district)),
    ];
    $("district-list").innerHTML = districts
      .map((district) => {
        const currentCount = state.rows.filter(
          (row) => row.district_name === district,
        ).length;
        const dongCount = features.filter(
          (feature) => feature.properties.district === district,
        ).length;
        return `<button type="button" class="district-card ${
          state.filter === district && !state.selectedDong ? "active" : ""
        }"
          data-district="${safe(
            district,
          )}" style="--district-color:${districtColor(district)}">
          <i class="district-swatch"></i><span><b>${safe(
            district,
          )}</b><small>${dongCount}개 법정동</small></span><strong>${currentCount}</strong>
        </button>`;
      })
      .join("");
    $("district-list")
      .querySelectorAll("button")
      .forEach((button) =>
        button.addEventListener("click", () => {
          state.filter = button.dataset.district;
          state.selectedDong = null;
          render();
        }),
      );

    $("active-dong-count").textContent = money.format(
      features.filter(
        (feature) =>
          (counts.get(
            dongKey(
              feature.properties.district,
              feature.properties.name,
            ),
          ) || 0) > 0,
      ).length,
    );
    $("legal-dong-total").textContent = money.format(features.length);
    const selectedRows = filteredRows();
    if (state.selectedDong) {
      const [district, name] = state.selectedDong.split("|");
      $("selected-area").textContent = `${district} ${name}`;
      $("selected-count").textContent =
        `현재 100건 중 ${money.format(selectedRows.length)}건`;
    } else if (state.filter !== "전체") {
      $("selected-area").textContent = state.filter;
      $("selected-count").textContent =
        `현재 100건 중 ${money.format(selectedRows.length)}건`;
    } else if (state.mode === "region") {
      $("selected-area").textContent =
        state.region.resolution.legalDongFullName;
      $("selected-count").textContent =
        `${dealMonthLabel(state.region.dealMonth)} 거래 ${money.format(
          state.region.totals.legalDong,
        )}건`;
    } else {
      $("selected-area").textContent = "화성시 전체";
      $("selected-count").textContent =
        `현재 ${money.format(state.rows.length)}건 전체 보기`;
    }
  }

  function renderResolution() {
    const card = $("region-resolution");
    if (state.mode !== "region" || !state.region) {
      card.hidden = true;
      return;
    }
    const { resolution, totals } = state.region;
    card.hidden = false;
    $("resolution-type").textContent =
      resolution.inputType === "행정동"
        ? "ADMIN-DONG → LEGAL-DONG"
        : "LEGAL-DONG MATCH";
    $("resolution-title").textContent =
      `${resolution.inputName} → ${resolution.legalDongFullName}`;
    $("resolution-note").textContent =
      resolution.caveat ||
      `${resolution.mapping} · 월 거래량 ${money.format(
        totals.legalDong,
      )}건`;
  }

  function render() {
    const rows = filteredRows();
    const pageSummary = stats(state.rows);
    const summary =
      state.mode === "region"
        ? {
            average: state.region.totals.averagePrice,
            median: state.region.totals.medianPrice,
            top: {
              price_manwon: state.region.totals.maxPrice,
              apartment_name: state.region.totals.topApartment,
            },
          }
        : pageSummary;
    const headlineCount =
      state.mode === "region"
        ? state.region.totals.legalDong
        : state.rows.length;
    $("metric-count").innerHTML =
      `${money.format(headlineCount)}<small>건</small>`;
    $("metric-count-label").textContent =
      state.mode === "region" ? "법정동 월 거래량" : "현재 화면";
    $("metric-count-meta").textContent =
      state.mode === "region" ? "MONTHLY VOLUME" : "PAGE SIZE";
    $("metric-average").textContent = summary.average
      ? wonLabel(summary.average)
      : "—";
    $("metric-median").textContent = summary.median
      ? wonLabel(summary.median)
      : "—";
    $("metric-top").textContent = summary.top
      ? wonLabel(summary.top.price_manwon)
      : "—";
    $("metric-top-name").textContent =
      summary.top?.apartment_name || "TOP DEAL";

    const total =
      state.mode === "region"
        ? state.region?.totals?.legalDong || 0
        : state.summary?.totalCount || 0;
    const start = state.rows.length ? state.offset + 1 : 0;
    const end = state.offset + state.rows.length;
    $("range-number").textContent =
      `${money.format(start)}–${money.format(end)}`;
    $("total-label").textContent = `/ ${money.format(total)}건`;
    $("progress-bar").style.width = total
      ? `${Math.min(100, (end / total) * 100)}%`
      : "0";
    $("next-btn").querySelector("span").textContent =
      end >= total ? "처음 100건으로" : "다음 100건 불러오기";
    $("rows").innerHTML = rows
      .map(
        (row) => `<tr>
        <td class="date-cell"><b>${safe(
          dateLabel(row.deal_date),
        )}</b><small>${safe(row.deal_date.slice(0, 4))}</small></td>
        <td><span class="district-tag">${safe(
          row.district_name,
        )}</span><small>${safe(row.neighborhood)}</small></td>
        <td><b>${safe(row.apartment_name)}</b><small>${safe(
          row.build_year,
        )}년 · ${safe(row.jibun)}</small></td>
        <td>${safe(decimal.format(row.area_sqm))}㎡</td><td>${safe(
          row.floor,
        )}층</td>
        <td class="price-cell">${safe(wonLabel(row.price_manwon))}</td>
        <td><span class="deal-type">${safe(
          row.deal_type || "미기재",
        )}</span></td></tr>`,
      )
      .join("");
    $("empty").hidden = rows.length > 0;

    if (state.mode === "region") {
      const { resolution, dealMonth } = state.region;
      $("map-title").textContent =
        `${resolution.legalDongName} 법정동 거래 지도`;
      $("map-source").innerHTML =
        `<b>VWorld 공간정보 오픈플랫폼</b><br>${safe(
          resolution.districtName,
        )} 법정동 경계 · 국토부 ${safe(dealMonthLabel(dealMonth))}`;
      $("map-panel-note").textContent =
        "선택 지역의 법정동 경계입니다. 다른 경계를 누르면 해당 법정동 거래량을 다시 조회합니다.";
      $("footer-month").textContent = dealMonthLabel(dealMonth);
    } else {
      $("map-title").textContent = "법정동으로 읽는 100건";
      $("map-source").innerHTML =
        "<b>VWorld 공간정보 오픈플랫폼</b><br>LT_C_ADEMD_INFO · 화성시 39개 법정동 경계";
      $("map-panel-note").textContent =
        "현재 100건에서 거래가 확인되는 법정동입니다. 지도 영역을 누르면 해당 구·법정동 거래만 볼 수 있습니다.";
      $("footer-month").textContent = "2026-06";
    }
    renderFilters();
    renderMap();
    renderResolution();
  }

  async function loadBatch(offset) {
    if (state.loading) return;
    state.loading = true;
    $("next-btn").disabled = true;
    $("notice").textContent =
      `${money.format(offset + 1)}번째 거래부터 불러오는 중입니다.`;
    try {
      const batch =
        state.summary.batches.find((item) => item.offset === offset) ||
        state.summary.batches[0];
      const response = await fetch(
        `data/${batch.file}?v=${encodeURIComponent(state.summary.updatedAt)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state.rows = await response.json();
      state.offset = batch.offset;
      state.filter = "전체";
      state.selectedDong = null;
      state.mode = "hwaseong";
      state.region = null;
      state.legalDongs = state.baseLegalDongs;
      $("notice").textContent =
        `화성시 수집본 ${money.format(batch.offset + 1)}–${money.format(
          batch.offset + batch.count,
        )}건 · ${state.rows.length}건 표시`;
      $("region-status").textContent =
        "지역을 입력하면 해당 법정동의 월 거래량과 실거래 목록을 불러옵니다.";
      render();
    } catch (error) {
      $("notice").textContent =
        `데이터를 불러오지 못했습니다: ${error.message}`;
    } finally {
      state.loading = false;
      $("next-btn").disabled = false;
    }
  }

  async function loadRegion(query, dealMonth, offset = 0, shouldScroll = true) {
    if (state.loading) return;
    state.loading = true;
    $("region-submit").disabled = true;
    $("next-btn").disabled = true;
    $("region-status").textContent =
      `${query}의 ${dealMonthLabel(dealMonth)} 거래량을 조회하는 중입니다.`;
    $("notice").textContent = "VWorld 지역 해석과 국토부 실거래를 연결하고 있습니다.";
    try {
      const response = await fetch(REGION_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, dealMonth, offset, limit: 100 }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(
          [payload?.error, payload?.detail].filter(Boolean).join(" ") ||
            `HTTP ${response.status}`,
        );
      }
      state.mode = "region";
      state.region = payload;
      state.rows = payload.rows;
      state.offset = payload.totals.offset;
      state.legalDongs = payload.boundaries;
      state.filter = "전체";
      state.selectedDong = null;
      $("region-input").value = query;
      $("region-month").value = dealMonthLabel(dealMonth);
      $("region-status").textContent =
        `${payload.resolution.legalDongFullName} · ${dealMonthLabel(
          dealMonth,
        )} 거래량 ${money.format(payload.totals.legalDong)}건`;
      $("notice").textContent =
        `${payload.resolution.legalDongFullName} ${money.format(
          payload.totals.offset + 1,
        )}–${money.format(
          payload.totals.offset + payload.totals.returned,
        )}건 표시`;
      render();
      if (shouldScroll) {
        document
          .querySelector(".metrics")
          .scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (error) {
      $("region-status").textContent = `조회 실패: ${error.message}`;
      $("notice").textContent =
        "지역 조회에 실패했습니다. 지역명과 거래월을 확인해 주세요.";
    } finally {
      state.loading = false;
      $("region-submit").disabled = false;
      $("next-btn").disabled = false;
    }
  }

  function downloadCsv() {
    const rows = filteredRows();
    const columns = [
      ["global_index", "순번"],
      ["district_code", "구코드"],
      ["district_name", "구"],
      ["neighborhood", "법정동"],
      ["apartment_name", "아파트"],
      ["deal_date", "계약일"],
      ["price_manwon", "거래금액(만원)"],
      ["area_sqm", "전용면적(㎡)"],
      ["floor", "층"],
      ["build_year", "건축년도"],
      ["jibun", "지번"],
      ["deal_type", "거래유형"],
      ["agent_location", "중개사소재지"],
      ["buyer_type", "매수자"],
      ["seller_type", "매도자"],
      ["cancellation_date", "해제사유발생일"],
      ["registration_date", "등기일자"],
      ["transaction_key", "거래키"],
    ];
    const lines = [
      columns.map(([, label]) => csvEscape(label)).join(","),
      ...rows.map((row) =>
        columns
          .map(([key]) =>
            csvEscape(key === "global_index" ? row[key] + 1 : row[key]),
          )
          .join(","),
      ),
    ];
    const blob = new Blob([`\ufeff${lines.join("\n")}\n`], {
      type: "text/csv;charset=utf-8",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    const area =
      state.mode === "region"
        ? state.region.resolution.legalDongFullName.replaceAll(" ", "_")
        : "화성시";
    const month =
      state.mode === "region" ? state.region.dealMonth : "202606";
    anchor.download =
      `${area}_아파트_실거래가_${month}_${state.offset + 1}-${
        state.offset + rows.length
      }.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  async function init() {
    try {
      const [summaryResponse, mapResponse] = await Promise.all([
        fetch("data/summary.json", { cache: "no-store" }),
        fetch("data/hwaseong-legal-dong.geojson", {
          cache: "force-cache",
        }),
      ]);
      if (!summaryResponse.ok) {
        throw new Error(`HTTP ${summaryResponse.status}`);
      }
      state.summary = await summaryResponse.json();
      if (mapResponse.ok) {
        state.baseLegalDongs = await mapResponse.json();
        state.legalDongs = state.baseLegalDongs;
      }
      await loadBatch(0);
    } catch (error) {
      $("notice").textContent =
        `요약 데이터를 불러오지 못했습니다: ${error.message}`;
    }
  }

  $("next-btn").addEventListener("click", () => {
    if (state.mode === "region") {
      const total = state.region.totals.legalDong;
      const next = state.offset + 100 >= total ? 0 : state.offset + 100;
      loadRegion(state.region.query, state.region.dealMonth, next, false);
      return;
    }
    if (!state.summary) return;
    const next =
      state.offset + 100 >= state.summary.totalCount ? 0 : state.offset + 100;
    loadBatch(next);
  });
  $("csv-btn").addEventListener("click", downloadCsv);
  $("clear-map-filter").addEventListener("click", () => {
    state.filter = "전체";
    state.selectedDong = null;
    render();
  });
  $("region-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("region-input").value.trim();
    const dealMonth = $("region-month").value.replace("-", "");
    loadRegion(query, dealMonth, 0, true);
  });
  document.querySelectorAll("[data-region-example]").forEach((button) => {
    button.addEventListener("click", () => {
      $("region-input").value = button.dataset.regionExample;
      $("region-input").focus();
    });
  });
  $("reset-region").addEventListener("click", () => loadBatch(0));
  init();
})();
