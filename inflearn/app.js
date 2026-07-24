const state = {
  courses: [],
  query: "",
  category: "",
  level: "",
};

const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("ko-KR");
const date = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parseDate(value) {
  if (!value) return null;
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T") + "+09:00");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compactDate(value) {
  const parsed = parseDate(value);
  return parsed ? date.format(parsed).replaceAll(". ", ".").replace(/\.$/, "") : "—";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
}

function fillSelect(selector, values) {
  const select = $(selector);
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
}

function renderSummary(snapshot) {
  const collected = parseDate(snapshot.collectedAt);
  $("#snapshot-date").textContent = collected
    ? snapshot.archiveDate.replaceAll("-", ".")
    : "—";
  $("#snapshot-time").textContent = collected
    ? `${dateTime.format(collected)} 수집`
    : "수집 일시 없음";
  $("#course-count").textContent = number.format(snapshot.count || state.courses.length);
  $("#instructor-count").textContent = number.format(
    new Set(state.courses.map((course) => course.instructor)).size
  );
}

function getFilteredCourses() {
  const normalizedQuery = state.query.trim().toLocaleLowerCase("ko");
  return state.courses.filter((course) => {
    const haystack = [
      course.title,
      course.instructor,
      ...(course.categories || []),
      ...(course.skills || []),
    ].join(" ").toLocaleLowerCase("ko");
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    const matchesCategory = !state.category || (course.categories || []).includes(state.category);
    const matchesLevel = !state.level || course.level === state.level;
    return matchesQuery && matchesCategory && matchesLevel;
  });
}

function renderCourses() {
  const courses = getFilteredCourses();
  const tbody = $("#course-rows");
  const template = $("#course-row-template");
  tbody.replaceChildren();

  courses.forEach((course) => {
    const row = template.content.cloneNode(true);
    row.querySelector(".rank-cell").textContent = String(course.rank).padStart(2, "0");
    row.querySelector(".course-title").textContent = course.title;
    const tags = row.querySelector(".course-tags");
    [course.level, ...(course.categories || []).slice(0, 1)].filter(Boolean).forEach((tag) => {
      const chip = document.createElement("span");
      chip.textContent = tag;
      tags.append(chip);
    });
    row.querySelector(".instructor-cell").textContent = course.instructor;
    row.querySelector(".price-cell").textContent = course.price || "—";
    row.querySelector(".rating-cell").textContent =
      course.rating == null ? "—" : Number(course.rating).toFixed(1);
    row.querySelector(".students-cell").textContent = number.format(course.studentCount || 0);
    row.querySelector(".date-cell").textContent = compactDate(course.publishedAt);
    row.querySelector(".link-cell a").href = course.url;
    tbody.append(row);
  });

  $("#empty-state").hidden = courses.length > 0;
  $("#result-summary").textContent = `전체 ${number.format(state.courses.length)}개 중 ${number.format(courses.length)}개 표시`;
}

function renderArchives(archives) {
  const list = $("#archive-list");
  list.replaceChildren();
  archives.forEach((archive, index) => {
    const link = document.createElement("a");
    link.className = "archive-item";
    link.href = archive.excel;
    link.setAttribute("download", "");
    link.innerHTML = `
      <div class="archive-item-top">
        <span>${index === 0 ? "LATEST XLSX" : "DAILY XLSX"}</span>
        <span aria-hidden="true">↓</span>
      </div>
      <div>
        <strong>${archive.date.replaceAll("-", ".")}</strong>
        <small>${number.format(archive.count)}개 강의 · Excel workbook</small>
      </div>
    `;
    list.append(link);
  });
}

async function loadData(cacheBust = false) {
  const suffix = cacheBust ? `?t=${Date.now()}` : "";
  $("#reload-button").disabled = true;
  $("#reload-button").textContent = "불러오는 중…";
  try {
    const [snapshotResponse, archivesResponse] = await Promise.all([
      fetch(`./data/latest.json${suffix}`),
      fetch(`./data/archives.json${suffix}`),
    ]);
    if (!snapshotResponse.ok || !archivesResponse.ok) throw new Error("데이터 응답 오류");
    const [snapshot, archiveData] = await Promise.all([
      snapshotResponse.json(),
      archivesResponse.json(),
    ]);
    state.courses = snapshot.courses || [];
    renderSummary(snapshot);
    if (!$("#category-filter").dataset.ready) {
      fillSelect("#category-filter", unique(state.courses.flatMap((course) => course.categories || [])));
      fillSelect("#level-filter", unique(state.courses.map((course) => course.level)));
      $("#category-filter").dataset.ready = "true";
    }
    renderCourses();
    renderArchives(archiveData.archives || []);
  } catch (error) {
    $("#result-summary").textContent = "데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    $("#empty-state").hidden = false;
    $("#empty-state strong").textContent = "데이터 연결을 확인해 주세요.";
    $("#empty-state span").textContent = "자동 수집 파일이 아직 없거나 갱신 중일 수 있습니다.";
  } finally {
    $("#reload-button").disabled = false;
    $("#reload-button").textContent = "데이터 다시 불러오기";
  }
}

$("#search-input").addEventListener("input", (event) => {
  state.query = event.target.value;
  renderCourses();
});
$("#category-filter").addEventListener("change", (event) => {
  state.category = event.target.value;
  renderCourses();
});
$("#level-filter").addEventListener("change", (event) => {
  state.level = event.target.value;
  renderCourses();
});
$("#reload-button").addEventListener("click", () => loadData(true));

loadData();
