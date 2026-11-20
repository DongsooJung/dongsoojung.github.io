/*
 * 진도 저장소 어댑터
 *
 * - 토스 앱(WebView) 안: 앱인토스 Storage API 사용
 * - 토스 앱 밖(로컬 개발, 웹·TWA 빌드): localStorage 사용
 *
 * 매 저장마다 localStorage에도 같은 스냅샷을 남기고 저장 시각(_savedAt)을 붙인다.
 * 네이티브 저장이 실패해 localStorage에만 최신본이 남은 경우에도,
 * 불러올 때 두 저장소 중 _savedAt이 더 최근인 쪽을 고르므로 기록이 되돌아가지 않는다.
 *
 * 다음 단계(TASKS.md 3단계): 기기 변경 후에도 기록을 유지하려면
 * User.getAnonymousKey()로 받은 사용자 식별키 기준으로 Supabase에 동기화한다.
 * 그 작업은 이 파일의 load()/save()만 바꾸면 되도록 인터페이스를 고정해 둔다.
 */
import { Storage } from "@apps-in-toss/web-framework";

const KEY = "stargate-thinking-math-v1";

function localGet() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function localSet(value) {
  try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
}
function parse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const at = (s) => (s && typeof s._savedAt === "number" ? s._savedAt : 0);

let useToss = true;

/** 저장된 상태를 불러온다. 없으면 null. */
export async function load() {
  let native = null;
  try {
    native = parse(await Storage.getItem(KEY));
  } catch {
    // 토스 앱 밖에서는 SDK 브릿지가 없어 실패한다.
    useToss = false;
  }
  const local = parse(localGet());
  if (!native) return local;
  if (!local) return native;
  return at(local) > at(native) ? local : native;
}

/* 입력(생각 노트) 중 브릿지 과다 호출을 막기 위해 400ms 디바운스.
 * 체크리스트: "앱 브릿지(SDK API)를 짧은 시간에 과도하게 호출하지 않아요." */
let timer = null;
let pending = null;

export function save(state) {
  pending = JSON.stringify({ ...state, _savedAt: Date.now() });
  if (timer) return;
  timer = setTimeout(flush, 400);
}

export async function flush() {
  clearTimeout(timer);
  timer = null;
  if (pending === null) return;
  const value = pending;
  pending = null;
  localSet(value);
  if (!useToss) return;
  try {
    await Storage.setItem(KEY, value);
  } catch {
    // 로컬 사본이 더 최신이므로 다음 실행 때 load()가 그쪽을 고른다.
    useToss = false;
  }
}

// 앱이 백그라운드로 갈 때 남은 저장분을 바로 기록
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flush();
});
