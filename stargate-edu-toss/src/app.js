import "./style.css";
import { graniteEvent } from "@apps-in-toss/web-framework";
import { ABOUT, APP, PARTNERS, PROBLEMS, SEAT_CLUBS, STAGES } from "./content.js";
import { emptyState, grade, neighborFriends, partnerCounts, progress, sanitize } from "./logic.js";
import { flush, load, save } from "./storage.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"]/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
}[ch]));

let view = "path";
let state = emptyState();
let ready = false;
let current = null;
let pick = null;
let lab = { A: 2, B: 1 };
let stopBack = null;
let backFailed = false;

$("#appSub").textContent = APP.subtitle;

function statusLabel(id) {
  const row = state.solved[id];
  if (row?.status === "ok") return `<span class="st ok">정답</span>`;
  if (row?.status === "bad") return `<span class="st bad">다시 도전</span>`;
  return `<span class="st">아직 안 풀었어요</span>`;
}

function renderStats() {
  const now = progress(state);
  $("#kPath").textContent = `${now.checked}/${now.itemTotal}`;
  $("#kSolved").textContent = `${now.solved}/${now.problemTotal}`;
}

function renderPath() {
  return `<div class="stack">${STAGES.map((stage) => `
    <section class="stage">
      <h2>${esc(stage.name)}</h2>
      <p class="summary">${esc(stage.summary)}</p>
      ${stage.items.map((item) => `
        <button class="check" type="button" data-check="${esc(item.id)}" aria-pressed="${state.checks[item.id] ? "true" : "false"}">
          <span class="box" aria-hidden="true"></span>
          <span>${esc(item.text)}</span>
        </button>`).join("")}
    </section>`).join("")}</div>`;
}

function renderPractice() {
  return `<div class="stack">${PROBLEMS.map((problem) => `
    <button class="card" type="button" data-open="${esc(problem.id)}">
      <div class="meta"><span>${esc(problem.stage)}</span>${statusLabel(problem.id)}</div>
      <h2>${esc(problem.title)}</h2>
      <p>${esc(problem.blurb)}</p>
    </button>`).join("")}</div>`;
}

function renderRecord() {
  const checked = STAGES.flatMap((stage) => stage.items.filter((item) => state.checks[item.id]).map((item) => item.text));
  const solved = PROBLEMS.filter((problem) => state.solved[problem.id]?.status === "ok").map((problem) => problem.title);
  const list = (items, empty) => items.length
    ? `<ul>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`
    : `<p class="summary">${empty}</p>`;
  return `<div class="stack">
    <section class="stage"><h2>체크한 경로</h2>${list(checked, "아직 체크한 항목이 없습니다.")}</section>
    <section class="stage"><h2>맞힌 연습</h2>${list(solved, "아직 맞힌 연습이 없습니다. 풀이만 본 문제는 여기에 들어가지 않습니다.")}</section>
    <div class="row-actions"><button class="danger" id="reset" type="button">기록 지우기</button></div>
  </div>`;
}

function renderAbout() {
  return `<section class="about">${ABOUT.map((line) => `<p>${esc(line)}</p>`).join("")}</section>`;
}

function render() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.setAttribute("aria-selected", tab.dataset.view === view ? "true" : "false");
  });
  renderStats();
  const root = $("#view");
  if (!ready) {
    root.innerHTML = `<p class="wait">기록을 불러오는 중입니다.</p>`;
    return;
  }
  if (view === "practice") root.innerHTML = renderPractice();
  else if (view === "record") root.innerHTML = renderRecord();
  else if (view === "about") root.innerHTML = renderAbout();
  else root.innerHTML = renderPath();
}

function watchBack(active) {
  if (!active) {
    if (typeof stopBack === "function") {
      try { stopBack(); } catch { /* 브릿지가 이미 끊긴 경우 */ }
    }
    stopBack = null;
    return;
  }
  if (stopBack || backFailed) return;
  try {
    const off = graniteEvent.addEventListener("backEvent", {
      onEvent: () => closeSheet(),
      onError: () => {},
    });
    stopBack = typeof off === "function" ? off : null;
    if (!stopBack) backFailed = true;
  } catch {
    backFailed = true;
  }
}

function paintLab() {
  const board = $("#board");
  if (!board || !current) return;
  if (current.lab === "seats") {
    const counts = neighborFriends(SEAT_CLUBS, lab.A, lab.B);
    board.innerHTML = counts.map((count, index) => `
      <div class="seat"><small>${index + 1}번 · 모임 ${SEAT_CLUBS[index]}</small><b>${count}명</b></div>`).join("");
    $("#labA").textContent = String(lab.A);
    $("#labB").textContent = String(lab.B);
    return;
  }
  board.innerHTML = PARTNERS.map((student, index) => `
    <div class="person"><small>${index + 1}번</small><b>${student.x}</b><small>그룹 ${student.g}</small></div>`).join("");
}

function drawSheet(feedback = "") {
  const problem = current;
  const row = state.solved[problem.id] || { status: "", tries: 0, hint: false, peeked: false };
  const showSolution = row.status === "ok" || row.peeked === true;
  const done = row.status === "ok";
  const labHtml = problem.lab === "seats" ? `
    <div class="lab">
      <p class="summary">실험 보드의 기본값은 A=2, B=1입니다. 문제의 A=1, B=2와 다릅니다.</p>
      <div class="ranges">
        <label>A · 같은 모임 거리 <span id="labA">${lab.A}</span></label>
        <input id="rangeA" type="range" min="1" max="4" value="${lab.A}" aria-label="같은 모임 거리">
        <label>B · 다른 모임 거리 <span id="labB">${lab.B}</span></label>
        <input id="rangeB" type="range" min="1" max="4" value="${lab.B}" aria-label="다른 모임 거리">
      </div>
      <div class="seats" id="board"></div>
    </div>` : problem.lab === "partners" ? `
    <div class="lab">
      <p class="summary">위치와 그룹만 보여 줍니다. 같은 그룹은 거리 3, 다른 그룹은 거리 5입니다.</p>
      <div class="people" id="board"></div>
    </div>` : "";
  const answerHtml = problem.type === "choice"
    ? `<div class="choices">${problem.choices.map((choice) => `
        <button class="choice" type="button" data-pick="${esc(choice)}" aria-pressed="${pick === choice}" ${done ? "disabled" : ""}>${esc(choice)}</button>`).join("")}
        <button class="go" id="go" type="button" ${done ? "disabled" : ""}>확인</button></div>`
    : `<div class="ans">
        <input id="ans" inputmode="numeric" autocomplete="off" aria-label="답" placeholder="숫자만 입력" ${done ? `value="${esc(problem.answer)}" disabled` : ""}>
        <button class="go" id="go" type="button" ${done ? "disabled" : ""}>확인</button>
      </div>`;
  $("#paper").innerHTML = `
    <div class="sheet-head">
      <div>
        <p class="summary">${esc(problem.stage)}</p>
        <h2 id="sheetTitle">${esc(problem.title)}</h2>
      </div>
      <button class="x" id="closeSheet" type="button" aria-label="문제 닫기">×</button>
    </div>
    <p class="notice">${esc(problem.notice)}</p>
    <p class="prompt">${esc(problem.prompt)}</p>
    ${labHtml}
    <label class="summary" for="note">풀이 메모</label>
    <textarea class="note" id="note" maxlength="500">${esc(state.notes[problem.id] || "")}</textarea>
    ${row.hint ? `<div class="hint">${esc(problem.hint)}</div>` : `<button class="ghost" id="useHint" type="button">힌트 보기</button>`}
    ${answerHtml}
    ${feedback}
    ${showSolution ? `<div class="sol"><b>풀이</b><ol>${problem.solution.map((line) => `<li>${esc(line)}</li>`).join("")}</ol><p>정답: ${esc(problem.answer)}${problem.unit ? ` ${esc(problem.unit)}` : ""}</p></div>` : ""}
    ${showSolution ? "" : `<button class="ghost" id="peek" type="button">풀이만 보기</button>`}
    <p class="foot">풀이만 보기는 맞힌 문제로 기록하지 않습니다.</p>`;
  paintLab();
}

function openSheet(id) {
  current = PROBLEMS.find((problem) => problem.id === id) || null;
  if (!current) return;
  pick = null;
  lab = { A: 2, B: 1 };
  $("#sheet").hidden = false;
  document.body.style.overflow = "hidden";
  drawSheet();
  watchBack(true);
}

function closeSheet() {
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
  current = null;
  watchBack(false);
  render();
}

function remember(problemId, patch, { immediate = true } = {}) {
  const prev = state.solved[problemId] || { status: "", tries: 0, hint: false, peeked: false };
  state.solved[problemId] = { ...prev, ...patch };
  save(state, { immediate });
}

function submit() {
  if (!current) return;
  const row = state.solved[current.id];
  if (row?.status === "ok") return;
  const value = current.type === "choice" ? pick : $("#ans")?.value;
  if (value == null || String(value).trim() === "") {
    drawSheet(`<div class="fb bad">답을 먼저 ${current.type === "choice" ? "골라" : "적어"} 주세요.</div>`);
    return;
  }
  const tries = (row?.tries || 0) + 1;
  if (grade(current, value)) {
    remember(current.id, { status: "ok", tries });
    drawSheet(`<div class="fb ok">정답입니다.</div>`);
    return;
  }
  remember(current.id, { status: "bad", tries });
  drawSheet(`<div class="fb bad">다시 계산해 보세요. 힌트를 열어도 맞힌 기록은 생기지 않습니다.</div>`);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-view],[data-check],[data-open],[data-pick],#go,#useHint,#peek,#closeSheet,#reset,#resetYes");
  if (!target) {
    if (event.target === $("#sheet")) closeSheet();
    return;
  }
  if (target.dataset.view) {
    view = target.dataset.view;
    render();
    return;
  }
  if (target.dataset.check) {
    const id = target.dataset.check;
    const on = target.getAttribute("aria-pressed") !== "true";
    if (on) state.checks[id] = true;
    else delete state.checks[id];
    target.setAttribute("aria-pressed", on ? "true" : "false");
    save(state, { immediate: true });
    renderStats();
    return;
  }
  if (target.dataset.open) return openSheet(target.dataset.open);
  if (target.dataset.pick != null) {
    pick = target.dataset.pick;
    drawSheet();
    return;
  }
  if (target.id === "go") return submit();
  if (target.id === "useHint" && current) {
    remember(current.id, { hint: true });
    drawSheet();
    return;
  }
  if (target.id === "peek" && current) {
    remember(current.id, { peeked: true });
    drawSheet();
    return;
  }
  if (target.id === "closeSheet") return closeSheet();
  if (target.id === "reset") {
    target.replaceWith(Object.assign(document.createElement("button"), {
      id: "resetYes",
      className: "danger",
      type: "button",
      textContent: "정말 지웁니다",
    }));
    return;
  }
  if (target.id === "resetYes") {
    state = emptyState();
    save(state, { immediate: true });
    render();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "note" && current) {
    state.notes[current.id] = event.target.value.slice(0, 500);
    if (!state.notes[current.id]) delete state.notes[current.id];
    save(state);
    return;
  }
  if (event.target.id === "rangeA" || event.target.id === "rangeB") {
    lab = {
      A: Number($("#rangeA").value),
      B: Number($("#rangeB").value),
    };
    paintLab();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.id === "ans") {
    event.preventDefault();
    submit();
  }
});

load().then((saved) => {
  state = sanitize(saved);
  ready = true;
  render();
}).catch(() => {
  ready = true;
  render();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
