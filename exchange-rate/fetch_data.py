#!/usr/bin/env python3
"""한국수출입은행 환율 API(일일 매매기준율)를 월간으로 집계하는 수집 스크립트.

한국수출입은행 공개 API(현재환율, data=AP01)를 영업일 단위로 호출해
통화별 매매기준율(deal_bas_r)을 수집하고, 월별 평균·최저·최고로 집계해
exchange-rate/data.json 을 갱신한다. GitHub Actions에서 매월 실행되며,
확정된 과거 월은 다시 호출하지 않고 최근 2개월과 결측 월만 재수집한다.

사용법:
    EXIM_API_KEY=<수출입은행 인증키> python3 fetch_data.py

인증키 발급: https://www.koreaexim.go.kr/ir/HPHKIR019M01  (오픈API > 현재환율)
"""

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from calendar import monthrange
from datetime import date, datetime, timezone
from pathlib import Path

API_URL = "https://www.koreaexim.go.kr/site/program/financial/exchangeJSON"

# 추적 통화 — key는 data.json에서 쓰는 식별자, unit은 API의 cur_unit 값.
# per는 표시 기준 단위(엔은 100엔당 고시), label은 한글명.
CURRENCIES = {
    "USD": {"unit": "USD",      "label": "미국 달러", "per": 1},
    "JPY": {"unit": "JPY(100)", "label": "일본 엔",   "per": 100},
    "EUR": {"unit": "EUR",      "label": "유로",      "per": 1},
    "CNH": {"unit": "CNH",      "label": "중국 위안", "per": 1},
}

START_YM = (2024, 1)
DATA_PATH = Path(__file__).parent / "data.json"
USE_INSECURE_TLS = False


def insecure_tls_context():
    """수출입은행의 불완전한 인증서 체인에만 사용하는 제한적 폴백."""
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    return context


def month_iter(start, end):
    y, m = start
    while (y, m) <= end:
        yield y, m
        m += 1
        if m > 12:
            y, m = y + 1, 1


def parse_rate(raw):
    """'1,330.5' 형태의 문자열을 float으로. 값이 없으면 None."""
    if raw is None:
        return None
    s = str(raw).replace(",", "").strip()
    if not s or s in ("0", "0.00"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def fetch_day(service_key, d):
    """해당 날짜의 AP01 응답(리스트)을 반환한다. 비영업일/미공표면 []."""
    params = urllib.parse.urlencode({
        "authkey": service_key,
        "searchdate": d.strftime("%Y%m%d"),
        "data": "AP01",
    })
    req = urllib.request.Request(
        f"{API_URL}?{params}",
        headers={"User-Agent": "stargateedu-dashboard"},
    )
    global USE_INSECURE_TLS
    try:
        context = insecure_tls_context() if USE_INSECURE_TLS else None
        with urllib.request.urlopen(req, timeout=30, context=context) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.URLError as exc:
        if USE_INSECURE_TLS or not isinstance(exc.reason, ssl.SSLCertVerificationError):
            raise
        # koreaexim.go.kr가 중간 인증서를 누락하는 경우가 있어 공식 고정 호스트에만
        # 검증 해제 폴백을 적용한다. 다른 호스트로 리디렉션되면 urllib가 이를 거부한다.
        print("수출입은행 인증서 체인 검증 실패 — 공식 호스트 TLS 폴백을 사용합니다.", file=sys.stderr)
        USE_INSECURE_TLS = True
        with urllib.request.urlopen(req, timeout=30, context=insecure_tls_context()) as resp:
            if urllib.parse.urlparse(resp.geturl()).hostname != "www.koreaexim.go.kr":
                raise RuntimeError("수출입은행 API가 예상하지 않은 호스트로 리디렉션되었습니다.")
            raw = resp.read().decode("utf-8")
    text = raw.strip()
    if not text or text == "[]":
        return []
    if text.startswith("<"):
        raise RuntimeError(f"HTML/XML error response: {text[:160]}")
    payload = json.loads(text)
    if isinstance(payload, dict):
        # 오류는 단일 객체(result != 1)로 내려오기도 한다
        raise RuntimeError(f"unexpected object response: {str(payload)[:160]}")
    return payload


def aggregate_month(service_key, y, m, today):
    """한 달의 영업일을 순회하며 통화별 일일 매매기준율을 모아 집계한다."""
    last = monthrange(y, m)[1]
    buckets = {k: [] for k in CURRENCIES}
    days_with_data = 0
    for day in range(1, last + 1):
        d = date(y, m, day)
        if d.weekday() >= 5:      # 토·일 제외
            continue
        if d > today:             # 미래 일자 제외
            break
        try:
            rows = fetch_day(service_key, d)
        except Exception as exc:  # 개별 일자 실패는 건너뛴다
            print(f"    ! {d} 조회 실패: {exc}", file=sys.stderr)
            time.sleep(0.2)
            continue
        if not rows:
            time.sleep(0.12)
            continue
        by_unit = {}
        for row in rows:
            if str(row.get("result")) not in ("1", "1.0"):
                continue
            by_unit[row.get("cur_unit")] = parse_rate(row.get("deal_bas_r"))
        got = False
        for key, info in CURRENCIES.items():
            v = by_unit.get(info["unit"])
            if v is not None:
                buckets[key].append(v)
                got = True
        if got:
            days_with_data += 1
        time.sleep(0.12)

    if days_with_data == 0:
        return None

    rates = {}
    for key, vals in buckets.items():
        if not vals:
            continue
        rates[key] = {
            "avg": round(sum(vals) / len(vals), 2),
            "min": round(min(vals), 2),
            "max": round(max(vals), 2),
        }
    if not rates:
        return None
    return {"days": days_with_data, "rates": rates}


def probe_reachable(service_key, today, tries=8):
    """최근 영업일 몇 개로 API 도달 가능성을 빠르게 확인한다.

    수출입은행 API는 해외(GitHub 러너) IP를 302 리다이렉트로 차단하는 경우가 있다.
    전 영업일(수백 회)을 순회하기 전에 먼저 소수만 시도해, 한 건도 응답을 받지
    못하면(모두 예외) 도달 불가로 판단하고 조기 종료한다. 응답이 오면(빈 목록 포함)
    도달 가능으로 본다.
    """
    d = today
    attempted = 0
    while attempted < tries:
        d = d.fromordinal(d.toordinal() - 1)
        if d.weekday() >= 5:
            continue
        attempted += 1
        try:
            fetch_day(service_key, d)      # 예외 없이 반환되면 도달 가능
            return True
        except Exception as exc:
            print(f"    · 도달 확인 {d} 실패: {exc}", file=sys.stderr)
    return False


def main():
    service_key = os.environ.get("EXIM_API_KEY", "").strip()
    if not service_key:
        print("EXIM_API_KEY 미설정 — 시드 데이터를 유지하고 종료합니다.")
        return 0

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    by_ym = {row["ym"]: row for row in data["series"]}

    today = date.today()
    end = (today.year, today.month)

    # 전 영업일 순회(수백 회) 전에 도달 가능성부터 확인 — 해외 IP 차단 시 즉시 종료
    if not probe_reachable(service_key, today):
        print("수출입은행 API에 도달하지 못했습니다(해외 IP 차단 추정) — "
              "환율 시드를 유지하고 종료합니다.", file=sys.stderr)
        return 1

    # 최근 2개월(현재·직전)은 잠정치 보정을 위해 항상 재수집한다.
    recent = set()
    ry, rm = end
    for _ in range(2):
        recent.add(f"{ry:04d}-{rm:02d}")
        rm -= 1
        if rm < 1:
            ry, rm = ry - 1, 12

    updated = 0
    for y, m in month_iter(START_YM, end):
        ym = f"{y:04d}-{m:02d}"
        existing = by_ym.get(ym)
        # 확정된 과거 월(시드가 아니고 최근 2개월도 아님)은 재호출 생략
        if existing and ym not in recent and not existing.get("approx"):
            continue
        print(f"  · {ym} 집계 중…", file=sys.stderr)
        agg = aggregate_month(service_key, y, m, today)
        if agg is None:
            continue
        by_ym[ym] = {"ym": ym, "days": agg["days"], "rates": agg["rates"]}
        updated += 1

    if updated == 0:
        print("오류: 수출입은행에서 유효한 환율 데이터를 한 달도 수집하지 못했습니다.", file=sys.stderr)
        return 1

    data["series"] = sorted(by_ym.values(), key=lambda r: r["ym"])
    data["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data["sourceMode"] = "api"

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fallback = DATA_PATH.parent / "fallback-data.js"
    fallback.write_text(
        "window.FALLBACK_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"완료: {updated}개월 갱신, 총 {len(data['series'])}개월.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
