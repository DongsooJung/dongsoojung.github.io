#!/usr/bin/env python3
"""한국은행 ECOS 경제통계시스템 OpenAPI에서 기준금리·소비자물가를 월별로 수집.

- 한국은행 기준금리: 통계표 722Y001, 항목 0101000, 주기 M (단위 %)
- 소비자물가지수(CPI): 통계표 901Y009, 항목 0(총지수), 주기 M (2020=100)
CPI는 전년동월비(cpiYoY, %)를 함께 산출하기 위해 12개월 이전부터 조회한다.
결과를 exchange-rate/bok_data.json / bok-fallback.js 로 저장한다.

사용법:
    BOK_API_KEY=<ECOS 인증키> python3 fetch_bok.py

인증키 발급: https://ecos.bok.or.kr/api/#/AuthKeyApply
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

BASE = "https://ecos.bok.or.kr/api/StatisticSearch"

SERIES_START = (2024, 1)   # 대시보드 표시 시작
CPI_LOOKBACK = (2023, 1)   # YoY 산출용 CPI 조회 시작
DATA_PATH = Path(__file__).parent / "bok_data.json"

BASE_RATE = {"stat": "722Y001", "item": "0101000", "label": "한국은행 기준금리", "unit": "%"}
CPI = {"stat": "901Y009", "item": "0", "label": "소비자물가지수", "unit": "2020=100"}


def ym_str(y, m):
    return f"{y:04d}{m:02d}"


def fetch_stat(key, stat, item, start_ym, end_ym):
    """월별 통계를 {'YYYYMM': float} 로 반환한다."""
    path = "/".join([
        BASE, key, "json", "kr", "1", "10000",
        stat, "M", start_ym, end_ym, item,
    ])
    req = urllib.request.Request(path, headers={"User-Agent": "stargateedu-dashboard"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    if "RESULT" in payload:  # 오류(인증 실패·데이터 없음 등)
        r = payload["RESULT"]
        raise RuntimeError(f"ECOS {r.get('CODE')}: {r.get('MESSAGE')}")
    rows = payload.get("StatisticSearch", {}).get("row", [])
    out = {}
    for row in rows:
        v = row.get("DATA_VALUE")
        if v in (None, "", "-"):
            continue
        try:
            out[row["TIME"]] = float(v)
        except (ValueError, KeyError):
            continue
    return out


def main():
    key = os.environ.get("BOK_API_KEY", "").strip()
    if not key:
        print("BOK_API_KEY 미설정 — 시드 데이터를 유지하고 종료합니다.")
        return 0

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    today = date.today()
    end_ym = ym_str(today.year, today.month)

    try:
        base_rates = fetch_stat(key, BASE_RATE["stat"], BASE_RATE["item"],
                                ym_str(*SERIES_START), end_ym)
        cpi = fetch_stat(key, CPI["stat"], CPI["item"],
                         ym_str(*CPI_LOOKBACK), end_ym)
    except Exception as exc:
        print(f"ECOS 조회 실패 — 시드 데이터 유지: {exc}", file=sys.stderr)
        return 0

    series = []
    y, m = SERIES_START
    while (y, m) <= (today.year, today.month):
        t = ym_str(y, m)
        ym_dash = f"{y:04d}-{m:02d}"
        br = base_rates.get(t)
        cp = cpi.get(t)
        prev = cpi.get(ym_str(y - 1, m))  # 전년동월 CPI
        yoy = round((cp / prev - 1) * 100, 1) if (cp and prev) else None
        if br is None and cp is None:
            m += 1
            if m > 12:
                y, m = y + 1, 1
            continue
        row = {"ym": ym_dash}
        if br is not None:
            row["baseRate"] = round(br, 2)
        if cp is not None:
            row["cpi"] = round(cp, 2)
        if yoy is not None:
            row["cpiYoY"] = yoy
        series.append(row)
        m += 1
        if m > 12:
            y, m = y + 1, 1

    data["series"] = series
    data["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data["sourceMode"] = "api"

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fallback = DATA_PATH.parent / "bok-fallback.js"
    fallback.write_text(
        "window.BOK_FALLBACK = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"완료: 기준금리·물가 {len(series)}개월 갱신.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
