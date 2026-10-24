#!/usr/bin/env python3
"""FRED에서 한·미 익일물 단기금리를 받아 30년 월별 금리차를 만든다.

- 한국: OECD/FRED IRSTCI01KRM156N
  (콜머니·은행간 익일물 금리, 월평균, %)
- 미국: Federal Reserve/FRED FEDFUNDS
  (실효 연방기금금리, 월평균, %)

두 시계열의 공통 월만 사용하고 ``한국 - 미국``을 %p로 계산한다.
FRED 그래프 CSV는 API 키 없이 내려받을 수 있다.
"""

import csv
import io
import json
import hashlib
import math
import sys
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path


FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv"
YEARS = 30
DATA_PATH = Path(__file__).parent / "rate_gap.json"
SOURCE_CHECKS = []

SERIES = {
    "korea": {
        "id": "IRSTCI01KRM156N",
        "label": "한국 콜머니·은행간 익일물 금리",
        "source": "OECD Main Economic Indicators via FRED",
        "url": "https://fred.stlouisfed.org/series/IRSTCI01KRM156N",
    },
    "us": {
        "id": "FEDFUNDS",
        "label": "미국 실효 연방기금금리",
        "source": "Federal Reserve Board H.15 via FRED",
        "url": "https://fred.stlouisfed.org/series/FEDFUNDS",
    },
}


def start_month(today):
    return date(today.year - YEARS, today.month, 1)


def month_sequence(start_ym, end_ym):
    y, m = map(int, start_ym.split("-"))
    end_y, end_m = map(int, end_ym.split("-"))
    while (y, m) <= (end_y, end_m):
        yield f"{y:04d}-{m:02d}"
        m += 1
        if m > 12:
            y, m = y + 1, 1


def parse_series(text, series_id, start, today):
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames != ["observation_date", series_id]:
        raise ValueError("FRED 날짜/시리즈 열 불일치")
    rows, seen = {}, set()
    for row in reader:
        observed = date.fromisoformat(row["observation_date"])
        if observed.day != 1 or not start <= observed <= today or observed in seen:
            raise ValueError("FRED 월별 기간/범위/중복 불일치")
        seen.add(observed)
        raw = row.get(series_id)
        if not raw or raw == ".":
            continue
        value = float(raw)
        if not math.isfinite(value):
            raise ValueError("FRED 비유한 금리")
        rows[observed.strftime("%Y-%m")] = value
    if not rows:
        raise ValueError("FRED 유효한 월별 관측 없음")
    return rows


def fetch_series(series_id, start):
    params = urllib.parse.urlencode({
        "id": series_id,
        "cosd": start.isoformat(),
    })
    req = urllib.request.Request(
        f"{FRED_CSV}?{params}",
        headers={"User-Agent": "stargateedu-dashboard/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read()
    rows = parse_series(raw.decode("utf-8-sig"), series_id, start, date.today())
    SOURCE_CHECKS.append({"url":req.full_url,"seriesId":series_id,"sha256":hashlib.sha256(raw).hexdigest(),"receivedAt":datetime.now(timezone.utc).isoformat(),"rows":len(rows)})
    return rows


def main():
    today = date.today()
    start = start_month(today)
    try:
        korea = fetch_series(SERIES["korea"]["id"], start)
        us = fetch_series(SERIES["us"]["id"], start)
    except Exception as exc:
        print(f"한·미 금리차 조회 실패: {exc}", file=sys.stderr)
        return 1

    common_months = sorted(set(korea) & set(us))
    if not common_months:
        print("한·미 금리차 공통 관측월이 없습니다.", file=sys.stderr)
        return 1
    expected = set(month_sequence(start.strftime("%Y-%m"), common_months[-1]))
    missing = sorted(expected - set(common_months))
    if missing:
        print(f"한·미 금리차 월 누락: {', '.join(missing[:12])}", file=sys.stderr)
        return 1
    end_y, end_m = map(int, common_months[-1].split("-"))
    freshness_lag = (today.year - end_y) * 12 + today.month - end_m
    if freshness_lag > 2:
        print(f"한·미 금리차 최신성 지연: {freshness_lag}개월", file=sys.stderr)
        return 1

    series = [
        {
            "ym": ym,
            "partial": ym == today.strftime("%Y-%m"),
            "koreaRate": float(Decimal(str(korea[ym])).quantize(Decimal('.001'),rounding=ROUND_HALF_EVEN)),
            "usRate": float(Decimal(str(us[ym])).quantize(Decimal('.001'),rounding=ROUND_HALF_EVEN)),
            "gap": float((Decimal(str(korea[ym])) - Decimal(str(us[ym]))).quantize(Decimal('.001'),rounding=ROUND_HALF_EVEN)),
        }
        for ym in common_months
    ]
    if len(series) < 300:
        print(f"한·미 금리차 관측치 부족: {len(series)}개월", file=sys.stderr)
        return 1

    data = {
        "source": "FRED (OECD 한국 익일물 금리 · Federal Reserve 미국 실효 연방기금금리)",
        "sourceMode": "api",
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "observedAt": common_months[-1],
        "sourceObservationTime": None,
        "collectedAt": max((c["receivedAt"] for c in SOURCE_CHECKS),default=datetime.now(timezone.utc).isoformat()),
        "snapshotUpdatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceChecks": list(SOURCE_CHECKS),
        "unit": "% · 금리차는 %p",
        "definition": "금리차 = 한국 콜머니·은행간 익일물 월평균 − 미국 실효 연방기금금리 월평균",
        "coverage": {"start": series[0]["ym"], "end": series[-1]["ym"], "months": len(series)},
        "meta": SERIES,
        "series": series,
    }

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fallback = DATA_PATH.parent / "rate-gap-fallback.js"
    fallback.write_text(
        "window.RATE_GAP_FALLBACK = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"완료: 한·미 금리차 {len(series)}개월 ({series[0]['ym']}~{series[-1]['ym']}) 갱신.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
