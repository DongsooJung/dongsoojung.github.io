const STORAGE_KEY = "byeol-thinking-math-progress-v1";

/** 같은 웹뷰 재접속용 저장. 기기 변경 유지는 토스 사용자 키 연동이 남은 작업이다. */
export const PERSISTENCE = "device-local";

export function normalizeAnswer(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/／/g, "/");
}

export function answersMatch(expected, given) {
  const left = normalizeAnswer(expected);
  const right = normalizeAnswer(given);
  if (!left || !right) return false;
  if (left === right) return true;
  if (/^-?\d+(?:\.\d+)?$/.test(left) && /^-?\d+(?:\.\d+)?$/.test(right)) {
    return Number(left) === Number(right);
  }
  return false;
}

export function judgeAttempt(problem, input) {
  const given = normalizeAnswer(input);
  if (!given) return { status: "empty" };
  return { status: answersMatch(problem.answer, given) ? "correct" : "incorrect" };
}

export function createProgressStore(storage, key = STORAGE_KEY) {
  const read = () => {
    try {
      const parsed = JSON.parse(storage.getItem(key) || "{}");
      return {
        solved: Array.isArray(parsed.solved) ? parsed.solved : [],
        hints: Array.isArray(parsed.hints) ? parsed.hints : [],
        revealed: Array.isArray(parsed.revealed) ? parsed.revealed : [],
      };
    } catch {
      return { solved: [], hints: [], revealed: [] };
    }
  };
  const write = (next) => storage.setItem(key, JSON.stringify(next));
  return {
    load: read,
    markSolved(id) {
      const current = read();
      if (!current.solved.includes(id)) current.solved.push(id);
      write(current);
      return current;
    },
    markHint(id) {
      const current = read();
      if (!current.hints.includes(id)) current.hints.push(id);
      write(current);
      return current;
    },
    markRevealed(id) {
      const current = read();
      if (!current.revealed.includes(id)) current.revealed.push(id);
      write(current);
      return current;
    },
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

export function mountApp(root, { problems, storage }) {
  const store = createProgressStore(storage);
  const state = {
    filter: "all",
    selectedId: null,
    draft: "",
    message: "",
  };

  const findProblem = () => problems.find((item) => item.id === state.selectedId);

  const render = () => {
    const progress = store.load();
    root.innerHTML = state.selectedId
      ? problemView(findProblem(), progress)
      : listView(progress);
    bind(progress);
  };

  const listView = (progress) => {
    const filters = [
      ["all", "전체"],
      ["성대경시형", "성대경시형"],
      ["생각하는황소형", "황소형"],
    ];
    const visible = problems.filter((item) => state.filter === "all" || item.series === state.filter);
    const cards = visible.map((item) => `
      <button class="card" type="button" data-open="${escapeHtml(item.id)}">
        <span class="meta">
          <span class="tag">${escapeHtml(item.series)}</span>
          <span class="tag">${escapeHtml(item.level)}</span>
          ${progress.solved.includes(item.id) ? '<span class="tag done">함께 풀었음</span>' : ""}
        </span>
        <strong>${escapeHtml(item.title)}</strong>
        <span class="topic">${escapeHtml(item.topic)} · 난도 ${escapeHtml(item.difficulty)}/5</span>
      </button>`).join("");
    return `
      <header class="hero">
        <p class="eyebrow">학부모와 함께</p>
        <h1>사고력 수학</h1>
        <p class="lead">보호자와 아이가 한 문항씩 조건을 읽고, 힌트는 한 번만 연 뒤 답을 맞춰 봅니다. 교육용 재구성 ${problems.length}문항이며 대회 기출 원문이 아닙니다.</p>
        <p class="count">함께 푼 문항 ${progress.solved.length}/${problems.length}</p>
      </header>
      <div class="filters" role="group" aria-label="문항 분류">
        ${filters.map(([id, label]) => `<button type="button" data-filter="${id}" class="${state.filter === id ? "on" : ""}">${label}</button>`).join("")}
      </div>
      <div class="list">${cards || '<p class="empty">이 분류의 문항이 없습니다.</p>'}</div>`;
  };

  const problemView = (problem, progress) => {
    if (!problem) {
      return `<p class="empty">문항을 찾지 못했습니다.</p><button type="button" data-close>문제 목록</button>`;
    }
    const hinted = progress.hints.includes(problem.id);
    const solved = progress.solved.includes(problem.id);
    const revealed = progress.revealed.includes(problem.id) || solved;
    return `
      <div class="bar"><button type="button" data-close>문제 목록</button></div>
      <article class="sheet">
        <p class="eyebrow">${escapeHtml(problem.series)} · ${escapeHtml(problem.level)}</p>
        <h1>${escapeHtml(problem.title)}</h1>
        <p class="statement">${escapeHtml(problem.problem)}</p>
        <label for="answer">함께 구한 답</label>
        <input id="answer" inputmode="text" autocomplete="off" value="${escapeHtml(state.draft)}" placeholder="예: 10 또는 9/10">
        <div class="actions">
          <button type="button" class="primary" data-check>답 확인</button>
          <button type="button" data-hint ${hinted ? "disabled" : ""}>${hinted ? "힌트를 이미 열었습니다" : "힌트 1회 보기"}</button>
        </div>
        ${hinted ? `<p class="hint">${escapeHtml(problem.hint)}</p>` : ""}
        <p class="message" role="status">${escapeHtml(state.message)}</p>
        ${revealed ? `<section class="solution"><h2>풀이</h2><ol>${problem.solution.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol><p class="answer-line">정답 ${escapeHtml(problem.answer)}</p></section>` : `<button type="button" class="text" data-reveal>풀이만 보기</button>`}
      </article>`;
  };

  const bind = (progress) => {
    root.querySelectorAll("[data-filter]").forEach((button) => {
      button.onclick = () => {
        state.filter = button.dataset.filter;
        render();
      };
    });
    root.querySelectorAll("[data-open]").forEach((button) => {
      button.onclick = () => {
        state.selectedId = button.dataset.open;
        state.draft = "";
        state.message = progress.solved.includes(state.selectedId) ? "이미 함께 맞춘 문항입니다. 풀이를 다시 볼 수 있습니다." : "";
        render();
      };
    });
    const close = root.querySelector("[data-close]");
    if (close) close.onclick = () => {
      state.selectedId = null;
      state.draft = "";
      state.message = "";
      render();
    };
    const input = root.querySelector("#answer");
    if (input) input.oninput = () => {
      state.draft = input.value;
    };
    const check = root.querySelector("[data-check]");
    if (check) check.onclick = () => {
      const problem = findProblem();
      const result = judgeAttempt(problem, state.draft);
      if (result.status === "empty") state.message = "답을 입력한 뒤 확인해 주세요.";
      else if (result.status === "correct") {
        store.markSolved(problem.id);
        state.message = "맞았습니다. 아래에서 풀이 과정을 함께 읽어 보세요.";
      } else state.message = "아직 다릅니다. 조건을 다시 읽고, 필요하면 힌트를 한 번만 열어 보세요.";
      render();
    };
    const hint = root.querySelector("[data-hint]");
    if (hint) hint.onclick = () => {
      store.markHint(state.selectedId);
      state.message = "힌트는 이 문항에 한 번만 열립니다.";
      render();
    };
    const reveal = root.querySelector("[data-reveal]");
    if (reveal) reveal.onclick = () => {
      store.markRevealed(state.selectedId);
      state.message = "풀이를 먼저 보면 맞춘 문항으로 기록되지 않습니다.";
      render();
    };
  };

  render();
  return { store, getState: () => state };
}
