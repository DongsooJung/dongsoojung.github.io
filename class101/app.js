const state = {
  courses: [],
  archiveDate: "",
  query: "",
  category: "",
  section: "",
};

const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat("ko-KR");
const dateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
}

function fillSelect(selector, values) {
  const select = $(selector);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function renderSummary(snapshot) {
  $("#course-count").textContent = number.format(snapshot.count || state.courses.length);
  $("#placement-count").textContent = number.format(snapshot.placementCount || state.courses.length);
  $("#section-count").textContent = number.format(snapshot.sectionCount || 0);
  $("#creator-count").textContent = number.format(
    new Set(state.courses.map((course) => course.creator)).size
  );
  $("#snapshot-time").textContent = snapshot.collectedAt
    ? `${dateTime.format(new Date(snapshot.collectedAt))} 수집`
    : "수집 일시 없음";
}

function filteredCourses() {
  const query = state.query.trim().toLocaleLowerCase("ko");
  return state.courses.filter((course) => {
    const haystack = [
      course.title,
      course.creator,
      course.category,
      course.parentCategory,
      ...(course.sections || []),
    ].join(" ").toLocaleLowerCase("ko");
    return (
      (!query || haystack.includes(query)) &&
      (!state.category || course.parentCategory === state.category) &&
      (!state.section || (course.sections || []).includes(state.section))
    );
  });
}

function renderCourses() {
  const courses = filteredCourses();
  const grid = $("#course-grid");
  const template = $("#course-card-template");
  grid.replaceChildren();

  courses.forEach((course) => {
    const card = template.content.cloneNode(true);
    const image = card.querySelector("img");
    image.src = course.thumbnailUrl || "";
    image.alt = "";
    image.loading = "lazy";
    card.querySelector(".rank").textContent = `#${String(course.rank).padStart(2, "0")}`;
    card.querySelector(".category").textContent = course.parentCategory || "미분류";
    card.querySelector("h3").textContent = course.title;
    card.querySelector(".creator").textContent = course.creator;

    const tags = card.querySelector(".tags");
    (course.sections || []).slice(0, 2).forEach((section) => {
      const tag = document.createElement("span");
      tag.textContent = section;
      tags.append(tag);
    });

    const link = card.querySelector("a");
    link.href = course.url;
    link.setAttribute("aria-label", `${course.title} 클래스101에서 보기`);
    grid.append(card);
  });

  $("#result-summary").textContent =
    `전체 ${number.format(state.courses.length)}개 중 ${number.format(courses.length)}개 표시`;
  $("#empty-state").hidden = courses.length > 0;
}

function downloadCsv() {
  const courses = filteredCourses();
  const headers = ["순위", "클래스명", "크리에이터", "상위 카테고리", "카테고리", "노출 섹션", "URL"];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = courses.map((course) => [
    course.rank,
    course.title,
    course.creator,
    course.parentCategory,
    course.category,
    (course.sections || []).join(" | "),
    course.url,
  ]);
  const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `class101_recommendations_${state.archiveDate || "latest"}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function loadData(cacheBust = false) {
  const suffix = cacheBust ? `?t=${Date.now()}` : "";
  $("#reload-button").disabled = true;
  try {
    const response = await fetch(`./data/latest.json${suffix}`);
    if (!response.ok) throw new Error(`데이터 응답 오류 (${response.status})`);
    const snapshot = await response.json();
    state.courses = snapshot.courses || [];
    state.archiveDate = snapshot.archiveDate || "";
    renderSummary(snapshot);

    if (!$("#category-filter").dataset.ready) {
      fillSelect("#category-filter", unique(state.courses.map((course) => course.parentCategory)));
      fillSelect("#section-filter", unique(state.courses.flatMap((course) => course.sections || [])));
      $("#category-filter").dataset.ready = "true";
    }
    renderCourses();
  } catch (error) {
    $("#result-summary").textContent = "데이터를 불러오지 못했습니다.";
    $("#empty-state").hidden = false;
    $("#empty-state").querySelector("p").textContent =
      "자동 수집 파일이 아직 없거나 갱신 중일 수 있습니다.";
  } finally {
    $("#reload-button").disabled = false;
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
$("#section-filter").addEventListener("change", (event) => {
  state.section = event.target.value;
  renderCourses();
});
$("#reload-button").addEventListener("click", () => loadData(true));
$("#csv-button").addEventListener("click", downloadCsv);

loadData();
