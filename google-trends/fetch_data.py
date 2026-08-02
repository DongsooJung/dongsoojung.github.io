#!/usr/bin/env python3
"""Google Trends 급상승 검색어 상위 100개 수집.

공식 공개 API는 없으므로 trends.google.com/trending 페이지에 임베드된
AF_initDataCallback(ds:0) 페이로드를 파싱한다. RSS(/trending/rss)는
지역당 10건만 제공하므로 대시보드용 상위 100 집계에는 부적합하다.

사용법:
    python3 google-trends/fetch_data.py
    GEO=KR HOURS=48 LIMIT=100 python3 google-trends/fetch_data.py
    GEO=KR,US,JP HOURS=24 LIMIT=100 python3 google-trends/fetch_data.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data.json"
FALLBACK_PATH = ROOT / "fallback-data.js"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)

# Google Trends 카테고리 ID → 한글 라벨 (Trends UI 기준 일부)
CATEGORY_LABELS = {
    0: "전체",
    1: "자동차·교통",
    2: "미용·패션",
    3: "비즈니스·산업",
    4: "연예·엔터",
    5: "기후·날씨",
    6: "전자제품",
    7: "금융",
    8: "음식·음료",
    9: "게임",
    10: "건강",
    11: "취미·레저",
    12: "직업·교육",
    13: "법률·정부",
    14: "기타",
    15: "애완동물",
    16: "정치",
    17: "스포츠",
    18: "여행",
    19: "과학",
    20: "쇼핑",
    21: "사회",
    22: "기타",
    23: "기타",
}

GEO_META = {
    "KR": {"label": "대한민국", "hl": "ko"},
    "US": {"label": "미국", "hl": "en-US"},
    "JP": {"label": "일본", "hl": "ja"},
    "GB": {"label": "영국", "hl": "en-GB"},
    "IN": {"label": "인도", "hl": "en-IN"},
    "DE": {"label": "독일", "hl": "de"},
    "FR": {"label": "프랑스", "hl": "fr"},
    "BR": {"label": "브라질", "hl": "pt-BR"},
    "TW": {"label": "대만", "hl": "zh-TW"},
    "AU": {"label": "호주", "hl": "en-AU"},
    "CA": {"label": "캐나다", "hl": "en-CA"},
    "ID": {"label": "인도네시아", "hl": "id"},
    "TH": {"label": "태국", "hl": "th"},
    "VN": {"label": "베트남", "hl": "vi"},
    "MX": {"label": "멕시코", "hl": "es-MX"},
    "SG": {"label": "싱가포르", "hl": "en-SG"},
    "HK": {"label": "홍콩", "hl": "zh-HK"},
}


def parse_list(env_name: str, default: str) -> list[str]:
    raw = os.environ.get(env_name, default).strip()
    return [p.strip().upper() for p in raw.split(",") if p.strip()]


def http_get(url: str, timeout: int = 45) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def extract_ds0(html: str) -> list:
    """AF_initDataCallback ds:0 데이터 배열을 추출한다."""
    m = re.search(
        r"AF_initDataCallback\(\{key:\s*'ds:0'.*?data:(.+?),\s*sideChannel:\s*\{\}\}\);",
        html,
        re.S,
    )
    if not m:
        raise ValueError("ds:0 페이로드를 찾지 못함 — Trends UI 구조 변경 가능")
    payload = json.loads(m.group(1))
    if not isinstance(payload, list) or len(payload) < 2:
        raise ValueError("ds:0 페이로드 형식 오류")
    rows = payload[1] or []
    if not isinstance(rows, list):
        raise ValueError("트렌드 행 배열이 아님")
    return rows


def category_label(cat_ids) -> str:
    if not cat_ids:
        return "미분류"
    first = cat_ids[0] if isinstance(cat_ids, list) else cat_ids
    try:
        return CATEGORY_LABELS.get(int(first), f"카테고리 {first}")
    except (TypeError, ValueError):
        return "미분류"


def parse_row(row: list, geo: str) -> dict | None:
    if not isinstance(row, list) or not row:
        return None
    title = row[0]
    if not title or not isinstance(title, str):
        return None
    started = None
    if len(row) > 3 and isinstance(row[3], list) and row[3]:
        try:
            started = int(row[3][0])
        except (TypeError, ValueError):
            started = None
    volume = 0
    if len(row) > 6 and row[6] is not None:
        try:
            volume = int(row[6])
        except (TypeError, ValueError):
            volume = 0
    related = []
    if len(row) > 9 and isinstance(row[9], list):
        related = [str(x) for x in row[9] if x][:12]
    cats = []
    if len(row) > 10 and isinstance(row[10], list):
        cats = [int(x) for x in row[10] if isinstance(x, (int, float))]
    explore_q = urllib.parse.quote_plus(title)
    return {
        "title": title,
        "volume": volume,
        "geo": geo,
        "startedAt": started,
        "related": related,
        "categories": cats,
        "category": category_label(cats),
        "exploreUrl": (
            f"https://trends.google.com/trends/explore"
            f"?q={explore_q}&date=now+1-d&geo={geo}&hl=ko"
        ),
    }


def fetch_geo(geo: str, hours: int) -> list[dict]:
    meta = GEO_META.get(geo, {"label": geo, "hl": "en"})
    hl = meta["hl"]
    url = (
        "https://trends.google.com/trending"
        f"?geo={urllib.parse.quote(geo)}&hl={urllib.parse.quote(hl)}&hours={int(hours)}"
    )
    html = http_get(url)
    rows = extract_ds0(html)
    items = []
    for row in rows:
        parsed = parse_row(row, geo)
        if parsed:
            items.append(parsed)
    return items


def dedupe_rank(items: list[dict], limit: int) -> list[dict]:
    """동일 검색어는 최고 검색량만 남기고 상위 limit개로 자른다."""
    best: dict[str, dict] = {}
    for it in items:
        key = it["title"].strip().lower()
        prev = best.get(key)
        if prev is None or it["volume"] > prev["volume"]:
            best[key] = it
    ranked = sorted(best.values(), key=lambda x: (-x["volume"], x["title"].lower()))
    out = []
    for i, it in enumerate(ranked[:limit], start=1):
        row = dict(it)
        row["rank"] = i
        out.append(row)
    return out


def summarize(items: list[dict]) -> dict:
    volumes = [it["volume"] for it in items if it.get("volume")]
    cat_counts: dict[str, int] = {}
    for it in items:
        cat = it.get("category") or "미분류"
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    cat_sorted = sorted(
        [{"category": k, "count": v} for k, v in cat_counts.items()],
        key=lambda x: (-x["count"], x["category"]),
    )
    return {
        "count": len(items),
        "totalVolume": int(sum(volumes)),
        "avgVolume": int(sum(volumes) / len(volumes)) if volumes else 0,
        "maxVolume": max(volumes) if volumes else 0,
        "minVolume": min(volumes) if volumes else 0,
        "topTitle": items[0]["title"] if items else None,
        "categories": cat_sorted,
    }


def write_fallback(payload: dict) -> None:
    body = (
        "/* auto-generated by fetch_data.py — do not edit by hand */\n"
        "window.GOOGLE_TRENDS_FALLBACK = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    FALLBACK_PATH.write_text(body, encoding="utf-8")


def main() -> int:
    geos = parse_list("GEO", "KR")
    hours = int(os.environ.get("HOURS", "48"))
    limit = int(os.environ.get("LIMIT", "100"))
    if hours not in (4, 24, 48, 168):
        print(f"경고: HOURS={hours} — Trends UI 권장값(4/24/48/168)이 아닐 수 있음", file=sys.stderr)

    collected: list[dict] = []
    errors: list[dict] = []
    for i, geo in enumerate(geos):
        try:
            items = fetch_geo(geo, hours)
            print(f"[ok] {geo}: {len(items)}건")
            collected.extend(items)
        except Exception as exc:  # noqa: BLE001 — 수집 파이프라인은 지역별 실패를 기록
            msg = f"{type(exc).__name__}: {exc}"
            print(f"[err] {geo}: {msg}", file=sys.stderr)
            errors.append({"geo": geo, "error": msg})
        if i < len(geos) - 1:
            time.sleep(0.6)

    if not collected:
        print("수집 실패 — 기존 data.json을 유지합니다.", file=sys.stderr)
        return 1

    ranked = dedupe_rank(collected, limit)
    now = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
    payload = {
        "updatedAt": now,
        "sourceMode": "api",
        "source": "Google Trends (trends.google.com/trending)",
        "geo": geos,
        "hours": hours,
        "limit": limit,
        "fetchedCount": len(collected),
        "uniqueCount": len(ranked),
        "errors": errors,
        "summary": summarize(ranked),
        "items": ranked,
    }

    DATA_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    write_fallback(payload)
    print(
        f"저장 완료: {DATA_PATH.name} · top {len(ranked)} · "
        f"총량 {payload['summary']['totalVolume']:,} · mode=api"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
