import { Storage } from "@apps-in-toss/web-framework";

const KEY = "stargate-edu-v1";

let useToss = true;
let timer = null;
let pending = null;

export async function load() {
  try {
    const raw = await Storage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    useToss = false;
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

function writeLocal(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* 저장 공간이 없으면 이번 세션 화면만 유지한다. */
  }
}

export function save(state, { immediate = false } = {}) {
  pending = JSON.stringify(state);
  if (immediate) return flush();
  if (timer) return Promise.resolve();
  timer = setTimeout(flush, 400);
  return Promise.resolve();
}

export async function flush() {
  clearTimeout(timer);
  timer = null;
  if (pending === null) return;
  const value = pending;
  pending = null;
  if (!useToss) {
    writeLocal(value);
    return;
  }
  try {
    await Storage.setItem(KEY, value);
  } catch {
    useToss = false;
    writeLocal(value);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
