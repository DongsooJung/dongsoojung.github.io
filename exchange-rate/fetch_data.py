#!/usr/bin/env python3
"""ECB 일일 기준환율을 원화 환율로 환산해 월간 데이터로 집계한다.

Frankfurter가 제공하는 ECB 기준환율을 한 번에 내려받아 USD/KRW,
JPY/KRW, EUR/KRW, CNY/KRW를 계산한다. 인증키와 국내 IP가 필요하지 않아
GitHub Actions에서 매일 안정적으로 실행할 수 있다.

사용법:
    python3 exchange-rate/fetch_data.py
"""

import json
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

API_URL = "https://api.frankfurter.app"
START_DATE = date(2024, 1, 1)
DATA_PATH = Path(__file__).parent / "data.json"

CURRENCIES = {
    "USD": {"label": "미국 달러", "per": 1, "color": "#3987e5"},
    "JPY": {"label": "일본 엔", "per": 100, "color": "#199e70"},
    "EUR": {"label": "유로", "per": 1, "color": "#c98500"},
    "CNY": {"label": "중국 위안", "per": 1, "color": "#b06de0"},
}


def fetch_ecb_rates(start, end):
    """EUR 기준 ECB 일일 환율을 가져온다."""
    query = urllib.parse.urlencode({"from": "EUR", "to": "USD,JPY,KRW,CNY"})
    url = f"{API_URL}/{start.isoformat()}..{end.isoformat()}?{query}"
    request = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "User-Agent": "stargateedu-dashboard/2.0"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        payload = json.load(response)

    rates = payload.get("rates")
    if not isinstance(rates, dict) or not rates:
        raise RuntimeError("ECB 환율 응답에 일일 데이터가 없습니다.")
    return rates


def to_krw_rates(row):
    """EUR 기준 교차환율을 통화 1단위당 KRW로 바꾼다(JPY는 100엔)."""
    required = ("USD", "JPY", "KRW", "CNY")
    missing = [code for code in required if not row.get(code)]
    if missing:
        raise ValueError(f"필수 통화 누락: {', '.join(missing)}")

    krw = float(row["KRW"])
    return {
        "USD": krw / float(row["USD"]),
        "JPY": krw / float(row["JPY"]) * 100,
        "EUR": krw,
        "CNY": krw / float(row["CNY"]),
    }


def aggregate(daily):
    """일일 환율을 월별 평균·최저·최고로 집계한다."""
    monthly = defaultdict(lambda: defaultdict(list))
    valid_daily = {}

    for observed_on, row in sorted(daily.items()):
        try:
            converted = to_krw_rates(row)
        except (TypeError, ValueError) as exc:
            print(f"경고: {observed_on} 데이터 제외 ({exc})", file=sys.stderr)
            continue
        valid_daily[observed_on] = converted
        ym = observed_on[:7]
        for code, value in converted.items():
            monthly[ym][code].append(value)

    if not valid_daily:
        raise RuntimeError("환산 가능한 ECB 환율 데이터가 없습니다.")

    series = []
    for ym, by_currency in sorted(monthly.items()):
        rates = {}
        day_counts = []
        for code in CURRENCIES:
            values = by_currency.get(code, [])
            if not values:
                continue
            day_counts.append(len(values))
            rates[code] = {
                "avg": round(sum(values) / len(values), 2),
                "min": round(min(values), 2),
                "max": round(max(values), 2),
            }
        if rates:
            series.append({"ym": ym, "days": min(day_counts), "rates": rates})

    latest_date = max(valid_daily)
    latest_rates = {code: round(value, 2) for code, value in valid_daily[latest_date].items()}
    return series, latest_date, latest_rates


def write_outputs(data):
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    DATA_PATH.write_text(rendered, encoding="utf-8")
    fallback = DATA_PATH.parent / "fallback-data.js"
    fallback.write_text(
        "window.FALLBACK_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )


def main():
    today = date.today()
    try:
        daily = fetch_ecb_rates(START_DATE, today)
        series, latest_date, latest_rates = aggregate(daily)
    except Exception as exc:
        print(f"환율 갱신 실패: {exc}", file=sys.stderr)
        return 1

    # 비정상적으로 오래된 성공 응답을 최신 데이터로 오인하지 않는다.
    age_days = (today - date.fromisoformat(latest_date)).days
    if age_days > 7:
        print(f"환율 갱신 실패: 최신 관측치가 {age_days}일 전({latest_date})입니다.", file=sys.stderr)
        return 1

    data = {
        "source": "유럽중앙은행(ECB) 기준환율 · Frankfurter API",
        "sourceUrl": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/",
        "sourceMode": "ecb",
        "updatedAt": latest_date,
        "observedAt": latest_date,
        "unit": "원 (KRW) · ECB 일일 기준환율의 월평균",
        "currencies": [
            {"code": code, **meta} for code, meta in CURRENCIES.items()
        ],
        "notes": (
            "ECB가 영업일마다 공표하는 EUR 기준환율에서 KRW 교차환율을 계산했습니다. "
            "USD·EUR·CNY는 1단위당 원화, JPY는 100엔당 원화입니다. "
            "시장 체결가가 아닌 일일 공식 기준환율이며 GitHub Actions가 매일 갱신합니다."
        ),
        "latest": {"date": latest_date, "rates": latest_rates},
        "series": series,
    }
    write_outputs(data)
    print(f"완료: 최신 {latest_date}, {len(series)}개월, {len(daily)}개 관측일 갱신.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
