/*
 * 진도 저장소 어댑터
 *
 * - 토스 앱(WebView) 안: 앱인토스 Storage API 사용
 * - 로컬 브라우저(npm run dev): localStorage로 대체
 *
 * 다음 단계(TASKS.md 3단계): 기기 변경 후에도 기록을 유지하려면
 * User.getAnonymousKey()로 받은 사용자 식별키 기준으로 Supabase에 동기화한다.
 * 그 작업은 이 파일의 load()/save()만 바꾸면 되도록 인터페이스를 고정해 둔다.
 */
import { Storage } from "@apps-in-toss/web-framework";

const KEY = "stargate-thinking-math-v1";

async function tossGet() {
  return Storage.getItem(KEY);
}
async function tossSet(value) {
  return Storage.setItem(KEY, value);
}

function localGet() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function localSet(value) {
  try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
}

let useToss = true;

/** 저장된 상태를 불러온다. 없으면 null. */
export async function load() {
  try {
    const raw = await tossGet();
    return raw ? JSON.parse(raw) : null;
  } catch {
    // 토스 앱 밖(로컬 브라우저)에서는 SDK 브릿지가 없어 실패한다.
    useToss = false;
    const raw = localGet();
    return raw ? JSON.parse(raw) : null;
  }
}

/* 입력(생각 노트) 중 브릿지 과다 호출을 막기 위해 400ms 디바운스.
 * 체크리스트: "앱 브릿지(SDK API)를 짧은 시간에 과도하게 호출하지 않아요." */
let timer = null;
let pending = null;

export function save(state) {
  pending = JSON.stringify(state);
  if (timer) return;
  timer = setTimeout(flush, 400);
}

export async function flush() {
  clearTimeout(timer);
  timer = null;
  if (pending === null) return;
  const value = pending;
  pending = null;
  if (!useToss) return localSet(value);
  try {
    await tossSet(value);
  } catch {
    useToss = false;
    localSet(value);
  }
}

// 앱이 백그라운드로 갈 때 남은 저장분을 바로 기록
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
