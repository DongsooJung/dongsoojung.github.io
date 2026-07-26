#!/usr/bin/env python3
"""비트코인 월별 시세를 집계한다.

Binance Vision 공개 API의 BTCUSDT 월봉(OHLC)을 사용한다.
인증키 없이 내려받을 수 있으며, 월평균은 (고가+저가)/2 로 계산한다.
"""

from __future__ import annotations

import json
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

HTTP_TIMEOUT = 60
START = datetime(2017, 8, 1, tzinfo=timezone.utc)
BINANCE_URL = "https://data-api.binance.vision/api/v3/klines"
DATA_PATH = Path(__file__).parent / "bitcoin_data.json"
FALLBACK_PATH = Path(__file__).parent / "bitcoin-fallback.js"


def download_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "stargateedu-dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_monthly_klines():
    rows = []
    start_ms = int(START.timestamp() * 1000)
    while True:
        url = (
            f"{BINANCE_URL}?symbol=BTCUSDT&interval=1M&limit=1000"
            f"&startTime={start_ms}"
        )
        batch = download_json(url)
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < 1000:
            break
        start_ms = int(batch[-1][0]) + 1
        time.sleep(0.2)

    seen = set()
    unique = []
    for row in rows:
        ts = int(row[0])
        if ts in seen:
            continue
        seen.add(ts)
        unique.append(row)
    if not unique:
        raise RuntimeError("Binance BTCUSDT 월봉이 비어 있습니다.")
    return unique


def main():
    try:
        klines = fetch_monthly_klines()
    except Exception as exc:
        print(f"비트코인 데이터 갱신 실패 — 기존 데이터를 유지합니다: {exc}", file=sys.stderr)
        return 0

    today = date.today()
    series = []
    observed_at = None
    for row in klines:
        open_time = datetime.fromtimestamp(int(row[0]) / 1000, tz=timezone.utc)
        close_time = datetime.fromtimestamp(int(row[6]) / 1000, tz=timezone.utc)
        ym = f"{open_time.year:04d}-{open_time.month:02d}"
        open_px = float(row[1])
        high = float(row[2])
        low = float(row[3])
        close = float(row[4])
        avg = (high + low) / 2
        series.append(
            {
                "ym": ym,
                "partial": open_time.year == today.year and open_time.month == today.month,
                "usd": round(avg, 2),
                "usdOpen": round(open_px, 2),
                "usdClose": round(close, 2),
                "usdMin": round(low, 2),
                "usdMax": round(high, 2),
            }
        )
        observed = min(close_time.date(), today).isoformat()
        observed_at = observed

    payload = {
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "sourceMode": "binance-vision",
        "observedAt": observed_at,
        "sources": {
            "bitcoin": {
                "name": "Binance Vision BTCUSDT Monthly Klines",
                "metric": "BTC/USDT 월봉 · 평균=(고가+저가)/2",
                "unit": "USD",
                "url": "https://data-api.binance.vision/",
                "observedAt": observed_at,
            }
        },
        "series": series,
    }
    DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    FALLBACK_PATH.write_text(
        "window.BITCOIN_FALLBACK = " + json.dumps(payload, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"완료: 비트코인 월별 시세 {len(series)}개월 갱신 (관측 {observed_at}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
