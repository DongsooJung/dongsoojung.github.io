import { PROBLEMS, STAGES } from "./content.js";

export function itemIds() {
  return STAGES.flatMap((stage) => stage.items.map((item) => item.id));
}

export function problemIds() {
  return PROBLEMS.map((problem) => problem.id);
}

export function emptyState() {
  return { checks: {}, solved: {}, notes: {} };
}

export function neighborFriends(clubs, A, B) {
  return clubs.map((club, i) => {
    let count = 0;
    for (let j = 0; j < clubs.length; j += 1) {
      if (i === j) continue;
      const distance = Math.abs(i - j);
      if (club === clubs[j] ? distance <= A : distance <= B) count += 1;
    }
    return count;
  });
}

export function partnerCounts(students, A, B) {
  return students.map((student, i) => {
    let count = 0;
    for (let j = 0; j < students.length; j += 1) {
      if (i === j) continue;
      const distance = Math.abs(student.x - students[j].x);
      const same = student.g === students[j].g;
      if (same ? distance <= A : distance <= B) count += 1;
    }
    return count;
  });
}

export function grade(problem, value) {
  const got = String(value ?? "").trim().replace(/\s+/g, "");
  const want = String(problem.answer).trim().replace(/\s+/g, "");
  return got !== "" && got === want;
}

function clipNote(value) {
  return String(value ?? "").slice(0, 500);
}

export function sanitize(raw) {
  const next = emptyState();
  if (!raw || typeof raw !== "object") return next;
  const checks = raw.checks && typeof raw.checks === "object" ? raw.checks : {};
  for (const id of itemIds()) {
    if (checks[id] === true) next.checks[id] = true;
  }
  const solved = raw.solved && typeof raw.solved === "object" ? raw.solved : {};
  for (const id of problemIds()) {
    const row = solved[id];
    if (!row || typeof row !== "object") continue;
    const entry = {
      status: row.status === "ok" || row.status === "bad" ? row.status : "",
      tries: Math.max(0, Math.min(99, Number(row.tries) || 0)),
      hint: row.hint === true,
      peeked: row.peeked === true,
    };
    if (!entry.status && !entry.tries && !entry.hint && !entry.peeked) continue;
    next.solved[id] = entry;
  }
  const notes = raw.notes && typeof raw.notes === "object" ? raw.notes : {};
  for (const id of problemIds()) {
    if (typeof notes[id] === "string" && notes[id]) next.notes[id] = clipNote(notes[id]);
  }
  return next;
}

export function progress(state) {
  const safe = sanitize(state);
  const items = itemIds();
  const checked = items.filter((id) => safe.checks[id]).length;
  const solved = PROBLEMS.filter((problem) => safe.solved[problem.id]?.status === "ok").length;
  return {
    checked,
    itemTotal: items.length,
    solved,
    problemTotal: PROBLEMS.length,
  };
}
