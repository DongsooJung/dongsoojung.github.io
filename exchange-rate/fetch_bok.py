#!/usr/bin/env python3
"""한국은행 ECOS 경제통계시스템 OpenAPI에서 기준금리·소비자물가를 월별로 수집.

- 한국은행 기준금리: 통계표 722Y001, 항목 0101000, 주기 M (단위 %)
- 소비자물가지수(CPI): 통계표 901Y009, 항목 0(총지수), 주기 M (2020=100)
CPI는 전년동월비(cpiYoY, %)를 함께 산출하기 위해 12개월 이전부터 조회한다.
결과를 exchange-rate/bok_data.json / bok-fallback.js 로 저장한다.

사용법:
    BOK_API_KEY=<ECOS 인증키> python3 fetch_bok.py
    # 키가 없으면 sample 키로 10건씩 나눠 과거 시드를 채웁니다.

인증키 발급: https://ecos.bok.or.kr/api/#/AuthKeyApply
"""

import json
import hashlib
import math
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path

HTTP_TIMEOUT = 60
RETRIES = 4
SAMPLE_CHUNK = 10  # ECOS sample 키는 조회건수 최대 10

BASE = "https://ecos.bok.or.kr/api/StatisticSearch"

# 한국은행 기준금리 공식 이력은 1999-05부터. CPI는 그보다 이전부터 조회.
SERIES_START = (1999, 5)
CPI_LOOKBACK = (1998, 5)
DATA_PATH = Path(__file__).parent / "bok_data.json"
SOURCE_CHECKS = []

BASE_RATE = {"stat": "722Y001", "item": "0101000", "label": "한국은행 기준금리", "unit": "%"}
CPI = {"stat": "901Y009", "item": "0", "label": "소비자물가지수", "unit": "2020=100"}


def ym_str(y, m):
    return f"{y:04d}{m:02d}"


def ym_add(y, m, n):
    idx = y * 12 + (m - 1) + n
    return idx // 12, idx % 12 + 1


def month_iter(start, end):
    y, m = start
    while (y, m) <= end:
        yield y, m
        y, m = ym_add(y, m, 1)


def fetch_stat_once(key, stat, item, start_ym, end_ym, page_end=10000):
    """월별 통계를 {'YYYYMM': float} 로 반환한다."""
    path = "/".join([
        BASE, key, "json", "kr", "1", str(page_end),
        stat, "M", start_ym, end_ym, item,
    ])
    req = urllib.request.Request(path, headers={"User-Agent": "stargateedu-dashboard"})
    payload = None
    for attempt in range(1, RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
                raw = resp.read()
                payload = json.loads(raw.decode("utf-8"))
            break
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            if attempt == RETRIES:
                raise
            wait = 2 ** attempt
            print(f"    · ECOS 요청 실패({attempt}/{RETRIES}) — {wait}s 후 재시도: {exc}",
                  file=sys.stderr)
            time.sleep(wait)
    if "RESULT" in payload:
        r = payload["RESULT"]
        raise RuntimeError(f"ECOS {r.get('CODE')}: {r.get('MESSAGE')}")
    rows = payload.get("StatisticSearch", {}).get("row", [])
    if int(payload.get("StatisticSearch", {}).get("list_total_count", len(rows))) != len(rows):
        raise ValueError("ECOS 응답이 요청 범위의 일부만 반환했습니다.")
    out = {}
    for row in rows:
        if row.get("STAT_CODE") != stat or row.get("ITEM_CODE1") != item:
            raise ValueError("ECOS 통계표/항목 코드 불일치")
        expected_unit = "연%" if stat == BASE_RATE["stat"] else "2020=100"
        if row.get("UNIT_NAME") != expected_unit:
            raise ValueError("ECOS 단위 불일치")
        if not start_ym <= row.get("TIME", "") <= end_ym or row["TIME"] in out:
            raise ValueError("ECOS 기간 범위/중복 불일치")
        v = row.get("DATA_VALUE")
        if v in (None, "", "-"):
            continue
        try:
            value = float(v)
        except (ValueError, KeyError):
            continue
        if not math.isfinite(value):
            raise ValueError("ECOS 비유한 수치")
        out[row["TIME"]] = value
    SOURCE_CHECKS.append({"url": path.replace('/' + key + '/', '/api-key/' if key != 'sample' else '/sample/', 1), "stat":stat, "item":item, "start":start_ym, "end":end_ym, "rows":len(out), "sha256":hashlib.sha256(raw).hexdigest(), "receivedAt":datetime.now(timezone.utc).isoformat()})
    return out


def fetch_stat(key, stat, item, start_ym, end_ym):
    """정식 키는 한 번에, sample 키는 10개월씩 나눠 조회한다."""
    if key != "sample":
        return fetch_stat_once(key, stat, item, start_ym, end_ym)

    start = (int(start_ym[:4]), int(start_ym[4:]))
    end = (int(end_ym[:4]), int(end_ym[4:]))
    out = {}
    cursor = start
    while cursor <= end:
        chunk_end = ym_add(*cursor, SAMPLE_CHUNK - 1)
        if chunk_end > end:
            chunk_end = end
        part = fetch_stat_once(
            key, stat, item, ym_str(*cursor), ym_str(*chunk_end), page_end=SAMPLE_CHUNK
        )
        out.update(part)
        print(f"    · sample {stat} {ym_str(*cursor)}-{ym_str(*chunk_end)} → {len(part)}건",
              file=sys.stderr)
        cursor = ym_add(*chunk_end, 1)
        time.sleep(0.15)
    return out


def build_series(base_rates, cpi, end, start=SERIES_START):
    if not base_rates or not cpi:
        raise ValueError("ECOS 통계 응답이 비어 있습니다.")
    common_last = min(max(base_rates), max(cpi))
    series = []
    for y, m in month_iter(start, end):
        t = ym_str(y, m)
        br, cp, prev = base_rates.get(t), cpi.get(t), cpi.get(ym_str(y-1, m))
        if t <= common_last and (br is None or cp is None or prev is None):
            raise ValueError("ECOS 공통 기간 또는 CPI 전년동월 누락: " + t)
        if br is None and cp is None:
            continue
        if any(v is not None and not math.isfinite(v) for v in (br, cp, prev)):
            raise ValueError("ECOS 비유한 수치: " + t)
        row = {"ym":f"{y:04d}-{m:02d}", "partial":(y, m) == end and end == (date.today().year, date.today().month)}
        if br is not None:
            row["baseRate"] = float(Decimal(str(br)).quantize(Decimal('.01'), rounding=ROUND_HALF_EVEN))
        if cp is not None:
            row["cpi"] = float(Decimal(str(cp)).quantize(Decimal('.01'), rounding=ROUND_HALF_EVEN))
            row["cpiRaw"] = cp
        if cp is not None and prev is not None:
            if cp <= 0 or prev <= 0:
                raise ValueError("CPI 양수 조건 불일치: " + t)
            row["cpiPriorYearRaw"] = prev
            row["cpiYoY"] = float(((Decimal(str(cp))/Decimal(str(prev))-1)*100).quantize(Decimal('.1'), rounding=ROUND_HALF_EVEN))
        series.append(row)
    return series


def main():
    key = os.environ.get("BOK_API_KEY", "").strip() or "sample"
    using_sample = key == "sample"
    if using_sample:
        print("BOK_API_KEY 미설정 — sample 키로 10건씩 나눠 과거 시드를 갱신합니다.")

    data = json.loads(DATA_PATH.read_text(encoding="utf-8")) if DATA_PATH.exists() else {
        "source": "한국은행 ECOS 경제통계시스템 OpenAPI (기준금리 722Y001 · 소비자물가지수 901Y009)",
        "meta": {
            "baseRate": {"label": "한국은행 기준금리", "unit": "%", "color": "#e0a24e"},
            "cpiYoY": {"label": "소비자물가 상승률", "unit": "% (전년동월비)", "color": "#e0685e"},
            "cpi": {"label": "소비자물가지수", "unit": "2020=100", "color": "#5eb0e0"},
        },
        "notes": "",
    }

    today = date.today()
    end_ym = ym_str(today.year, today.month)

    try:
        base_rates = fetch_stat(key, BASE_RATE["stat"], BASE_RATE["item"],
                                ym_str(*SERIES_START), end_ym)
        cpi = fetch_stat(key, CPI["stat"], CPI["item"],
                         ym_str(*CPI_LOOKBACK), end_ym)
        series = build_series(base_rates, cpi, (today.year, today.month))
    except Exception as exc:
        print(f"ECOS 조회/범위 검증 실패 — 기존 파일/갱신일 유지: {type(exc).__name__}", file=sys.stderr)
        return 1

    if not series:
        print("ECOS 결과가 비어 있어 시드 데이터를 유지합니다.", file=sys.stderr)
        return 1

    if data.get("series") != series and "sourceVerification" in data:
        data["previousSourceVerification"] = data.pop("sourceVerification")
    data["series"] = series
    data["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data["sourceMode"] = "sample" if using_sample else "api"
    data["observedAt"] = series[-1]["ym"]
    data["sourceObservationTime"] = None
    data["collectedAt"] = max((c["receivedAt"] for c in SOURCE_CHECKS), default=datetime.now(timezone.utc).isoformat())
    data["snapshotUpdatedAt"] = datetime.now(timezone.utc).isoformat()
    data["sourceChecks"] = list(SOURCE_CHECKS)
    data["coverage"] = {
        "start": series[0]["ym"],
        "end": series[-1]["ym"],
        "months": len(series),
    }
    data["notes"] = (
        "한국은행 ECOS OpenAPI의 기준금리(722Y001)와 소비자물가지수(901Y009, 2020=100)입니다. "
        "물가상승률은 전년동월비(YoY)입니다. "
        + ("정식 BOK_API_KEY 등록 시 Actions가 정밀 키로 재수집합니다. " if using_sample else "")
        + f"커버리지: {series[0]['ym']} ~ {series[-1]['ym']}."
    )

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fallback = DATA_PATH.parent / "bok-fallback.js"
    fallback.write_text(
        "window.BOK_FALLBACK = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"완료: 기준금리·물가 {len(series)}개월 갱신 ({series[0]['ym']}~{series[-1]['ym']}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
