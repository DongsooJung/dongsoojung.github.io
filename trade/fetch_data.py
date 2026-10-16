#!/usr/bin/env python3
"""관세청 '국가별 수출입실적(GW)' 월별 수집 스크립트.

공공데이터포털 API(data.go.kr/data/15101612, apis.data.go.kr/1220000/nationtrade)를
월 단위로 호출해 trade/data.json 을 갱신한다. 월별 총계(수출·수입·무역수지)와
국가별 내역(수출액 기준 상위 TOP_N개국)을 저장하며, GitHub Actions에서 매월
16일(전월 자료가 15일경 현행화된 직후) 실행된다.

확정된 과거 월은 다시 호출하지 않고, 신고 정정·취하 반영을 위해 최근 3개월과
시드(approx) 월만 재수집한다. 금액 단위는 백만 달러(수출 FOB · 수입 CIF).

관세청 게이트웨이가 해외 IP를 403으로 차단하는 경우 CUSTOMS_PROXY_BASE(서울
리전 프록시, /api/customs)를 설정하면 프록시를 경유해 국내 IP로 호출한다.

사용법:
    CUSTOMS_API_KEY=<data.go.kr 인증키(Decoding)> python3 fetch_data.py
    CUSTOMS_PROXY_BASE=https://<도메인>/api/customs  (선택 — 해외 IP 차단 우회)
    START_YM=2010-01  (선택 — 기본 2010-01, 과거 백필 시작 연월)

인증키 발급: https://www.data.go.kr/data/15101612/openapi.do (활용신청)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from pathlib import Path

API_URL = "https://apis.data.go.kr/1220000/nationtrade/getNationtradeList"
PROXY_BASE = os.environ.get("CUSTOMS_PROXY_BASE", "").strip().rstrip("/")

DEFAULT_START_YM = (2010, 1)  # 관세청 GW API 샘플(2016)보다 앞선 구간까지 백필 가능
TOP_N = 40          # 월별로 저장할 국가 수(수출액 기준) — 이하는 표·차트에 쓰이지 않아 생략
RECENT_MONTHS = 3   # 정정·취하 반영을 위해 항상 재수집하는 최근 개월 수
DATA_PATH = Path(__file__).parent / "data.json"


def parse_start_ym(default=DEFAULT_START_YM):
    """환경변수 START_YM(YYYY-MM 또는 YYYYMM)으로 시작 연월을 덮어쓸 수 있다."""
    raw = os.environ.get("START_YM", "").strip().replace("-", "")
    if not raw:
        return default
    if len(raw) == 6 and raw.isdigit():
        y, m = int(raw[:4]), int(raw[4:])
        if 1 <= m <= 12:
            return y, m
    raise SystemExit(f"START_YM 형식 오류: {os.environ.get('START_YM')!r} (예: 2010-01)")


def month_iter(start, end):
    y, m = start
    while (y, m) <= end:
        yield y, m
        m += 1
        if m > 12:
            y, m = y + 1, 1


def prev_month(y, m):
    return (y - 1, 12) if m == 1 else (y, m - 1)


def num(el, tag):
    """Return an integer dollar amount without rounding it to millions."""
    node = el.find(tag)
    if node is None or node.text is None:
        raise ValueError(f"필수 금액 누락: {tag}")
    s = node.text.replace(",", "").strip()
    if not s:
        raise ValueError(f"필수 금액 누락: {tag}")
    try:
        return int(s)
    except ValueError:
        raise ValueError(f"정수 금액 형식 오류: {tag}") from None


def text(el, tag):
    node = el.find(tag)
    return (node.text or "").strip() if node is not None else ""


def parse_month(raw):
    """Validate dollar rows, aggregate all countries, then round only once."""
    root = ET.fromstring(raw)
    code = (root.findtext(".//resultCode") or "").strip()
    if code not in ("00", "0000"):
        raise RuntimeError(f"API error {code or 'missing resultCode'}")
    count = int(root.findtext(".//totalCount") or "0")
    if count > 500:
        raise ValueError("국가 목록이 한 페이지를 초과합니다.")
    total = None
    rows = []
    seen = set()
    for item in root.iter("item"):
        stat_cd, name, year = text(item, "statCd"), text(item, "statCdCntnKor1"), text(item, "year")
        exp_d, imp_d = num(item, "expDlr"), num(item, "impDlr")
        bal_d = num(item, "balPayments") if text(item, "balPayments") else exp_d - imp_d
        if exp_d < 0 or imp_d < 0 or abs(exp_d - imp_d - bal_d) > 1:
            raise ValueError("달러 원값의 수출·수입·수지 검증 실패")
        row = {"exp": exp_d, "imp": imp_d, "bal": bal_d}
        if "총계" in (stat_cd, name, year):
            if total is not None:
                raise ValueError("총계 행 중복")
            total = row
        elif stat_cd and name:
            if stat_cd in seen:
                raise ValueError("국가 코드 중복")
            seen.add(stat_cd)
            rows.append({"cd": stat_cd, "name": name, **row})
    if not rows and total is None:
        return None
    if total is None:
        total = {key: sum(row[key] for row in rows) for key in ("exp", "imp", "bal")}
    rows.sort(key=lambda row: row["exp"], reverse=True)
    def million(row):
        return {**row, **{key: round(row[key] / 1_000_000) for key in ("exp", "imp", "bal")}}
    return million(total), [million(row) for row in rows[:TOP_N]]


def fetch_month(service_key, ym):
    """해당 연월의 전체 국가 실적을 (총계, 국가행 리스트)로 반환. 미공표면 None."""
    query = {"strtYymm": ym, "endYymm": ym, "numOfRows": "500", "pageNo": "1"}
    headers = {"User-Agent": "stargateedu-dashboard", "Accept": "application/xml"}
    if PROXY_BASE:
        # 서울 리전 프록시 경유 — 인증키는 헤더로 전달(URL 로그 노출 방지)
        url = f"{PROXY_BASE}?{urllib.parse.urlencode(query)}"
        headers["x-data-key"] = service_key
    else:
        url = f"{API_URL}?{urllib.parse.urlencode({'serviceKey': service_key, **query})}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code}: 관세청 응답 실패") from None
    return parse_month(raw)


def main():
    service_key = os.environ.get("CUSTOMS_API_KEY", "").strip()
    if not service_key:
        print("CUSTOMS_API_KEY 미설정 — 무역 수집을 실행할 수 없습니다.", file=sys.stderr)
        return 1

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    by_ym = {row["ym"]: row for row in data["series"]}
    countries = data.setdefault("countries", {})

    start_ym = parse_start_ym()
    today = date.today()
    # 전월 자료까지 공표(매월 15일경 현행화) — 이달 15일 이전엔 전전월까지만 시도
    end = prev_month(today.year, today.month)
    if today.day < 15:
        end = prev_month(*end)

    recent = set()
    ry, rm = end
    for _ in range(RECENT_MONTHS):
        recent.add(f"{ry:04d}-{rm:02d}")
        ry, rm = prev_month(ry, rm)

    print(f"수집 범위: {start_ym[0]:04d}-{start_ym[1]:02d} ~ {end[0]:04d}-{end[1]:02d} "
          f"(최근 {RECENT_MONTHS}개월·결측·approx만 재수집)", file=sys.stderr)
    updated = 0
    failures = 0
    for y, m in month_iter(start_ym, end):
        ym_dash = f"{y:04d}-{m:02d}"
        existing = by_ym.get(ym_dash)
        # 총계만 있고 국가 상세가 없는 과거 월도 백필 대상으로 본다
        if (existing and ym_dash not in recent and not existing.get("approx")
                and ym_dash in countries and countries[ym_dash]):
            continue
        print(f"  · {ym_dash} 수집 중…", file=sys.stderr)
        try:
            result = fetch_month(service_key, f"{y:04d}{m:02d}")
        except Exception as exc:  # 개별 월 실패는 건너뛰고 계속
            print(f"  ! {ym_dash} 실패: {exc}", file=sys.stderr)
            failures += 1
            time.sleep(0.3)
            continue
        if result is None:
            print(f"    · {ym_dash} 미공표 — 건너뜀", file=sys.stderr)
            continue
        total, rows = result
        by_ym[ym_dash] = {"ym": ym_dash, **total}
        countries[ym_dash] = rows
        updated += 1
        time.sleep(0.3)

    if not updated:
        # 갱신된 월이 없으면 updatedAt만 바뀐 무의미한 커밋을 만들지 않는다
        print("완료: 갱신된 월 없음 — 파일을 수정하지 않습니다.")
        return 1 if failures else 0

    series = sorted(by_ym.values(), key=lambda r: r["ym"])
    data["series"] = series
    data["latestYm"] = max((r["ym"] for r in series if not r.get("approx")), default=series[-1]["ym"]) \
        if any(not r.get("approx") for r in series) else series[-1]["ym"]
    data["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if updated:
        data["sourceMode"] = "api"
        data["countryLatestYm"] = max((ym for ym, rows in countries.items() if rows), default=None)
        data["source"] = "관세청 국가별 수출입실적 API"
        data["sourceUrl"] = API_URL
        data["aggregateSource"] = "관세청 API · 달러 원값 전체 합산 후 백만 달러 반올림"
        data["collectedAt"] = datetime.now(timezone.utc).isoformat()
        data["roundingNote"] = "국가별 상위 40개와 전체 총계는 범위가 다릅니다. 백만 달러 단위 독립 반올림으로 수출−수입과 수지에 최대 1 차이가 날 수 있습니다."
        for key in ("sourceVerification", "verifiedAt", "verifiedPeriods"):
            data.pop(key, None)

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (DATA_PATH.parent / "fallback-data.js").write_text(
        "window.FALLBACK_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"완료: {updated}개월 갱신, 총 {len(series)}개월.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
