#!/usr/bin/env python3
"""DRAM 소매가격과 브렌트유를 연간 평균으로 집계한다.

DRAM은 Stanford DAM 공개 CSV의 전체 DRAM 최저 소매가격(USD/GB)을 사용한다.
2024년 7월까지 McCallum 계열, 2024년 8월부터 Keepa 계열을 이어 붙인다.
유가는 FRED가 배포하는 EIA 브렌트유 일일 현물가격(DCOILBRENTEU)을 사용한다.

두 소스 모두 인증키 없이 내려받을 수 있다.
"""

import csv
import io
import json
import sys
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path


START_YEAR = 2018
HTTP_TIMEOUT = 60
DRAM_URL = "https://dam.stanford.edu/assets/memory-prices/memory-prices.csv"
BRENT_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU"
DATA_PATH = Path(__file__).parent / "market_data.json"


def download_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "stargateedu-dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as response:
        return response.read().decode("utf-8-sig")


def mean(values):
    return sum(values) / len(values) if values else None


def fetch_dram():
    rows = csv.DictReader(io.StringIO(download_text(DRAM_URL)))
    yearly = defaultdict(list)
    last_date = None
    for row in rows:
        if row.get("category") != "DRAM" or row.get("metric") != "usd_per_gb":
            continue
        observed = row.get("date", "")
        try:
            year = int(observed[:4])
            value = float(row["value"])
        except (ValueError, TypeError, KeyError):
            continue
        if year < START_YEAR:
            continue
        series = row.get("series", "")
        use_historical = series == "McCallum DRAM (historical)" and observed < "2024-08-01"
        use_live = series == "DRAM cheapest (Keepa)" and observed >= "2024-08-01"
        if not (use_historical or use_live):
            continue
        yearly[year].append(value)
        if last_date is None or observed > last_date:
            last_date = observed
    if not yearly:
        raise RuntimeError("Stanford DAM DRAM 데이터가 비어 있습니다.")
    return yearly, last_date


def fetch_brent():
    rows = csv.DictReader(io.StringIO(download_text(BRENT_URL)))
    yearly = defaultdict(list)
    last_date = None
    for row in rows:
        observed = row.get("observation_date", "")
        try:
            year = int(observed[:4])
            value = float(row["DCOILBRENTEU"])
        except (ValueError, TypeError, KeyError):
            continue
        if year < START_YEAR:
            continue
        yearly[year].append(value)
        if last_date is None or observed > last_date:
            last_date = observed
    if not yearly:
        raise RuntimeError("FRED 브렌트유 데이터가 비어 있습니다.")
    return yearly, last_date


def main():
    try:
        dram, dram_last = fetch_dram()
        brent, brent_last = fetch_brent()
    except Exception as exc:
        print(f"시장 데이터 갱신 실패 — 기존 데이터를 유지합니다: {exc}", file=sys.stderr)
        return 0

    years = sorted(set(dram) | set(brent))
    current_year = date.today().year
    series = []
    for year in years:
        row = {"year": year, "partial": year == current_year}
        if dram.get(year):
            row["dramUsdPerGb"] = round(mean(dram[year]), 3)
            row["dramObservations"] = len(dram[year])
        if brent.get(year):
            row["brentUsdPerBbl"] = round(mean(brent[year]), 2)
            row["brentObservations"] = len(brent[year])
        series.append(row)

    payload = {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "sourceMode": "public-csv",
        "sources": {
            "dram": {
                "name": "Stanford DAM Memory Prices",
                "metric": "DRAM 최저 소비자 소매가격",
                "unit": "USD/GB",
                "url": "https://dam.stanford.edu/memory-prices.html",
                "observedAt": dram_last,
            },
            "brent": {
                "name": "FRED DCOILBRENTEU (원출처: U.S. EIA)",
                "metric": "Brent Europe 현물가격",
                "unit": "USD/barrel",
                "url": "https://fred.stlouisfed.org/series/DCOILBRENTEU",
                "observedAt": brent_last,
            },
        },
        "series": series,
    }
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (DATA_PATH.parent / "market-fallback.js").write_text(
        "window.MARKET_FALLBACK = " + json.dumps(payload, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"완료: DRAM·브렌트유 {len(series)}개 연도 갱신.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
