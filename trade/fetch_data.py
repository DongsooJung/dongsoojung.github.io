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

START_YM = (2024, 1)
TOP_N = 40          # 월별로 저장할 국가 수(수출액 기준) — 이하는 표·차트에 쓰이지 않아 생략
RECENT_MONTHS = 3   # 정정·취하 반영을 위해 항상 재수집하는 최근 개월 수
DATA_PATH = Path(__file__).parent / "data.json"


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
    """item 하위 tag의 숫자값. 없거나 비면 0."""
    node = el.find(tag)
    if node is None or node.text is None:
        return 0
    s = node.text.replace(",", "").strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def text(el, tag):
    node = el.find(tag)
    return (node.text or "").strip() if node is not None else ""


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
        # 게이트웨이가 4xx/5xx로 내려주는 오류 본문(키 미승인 사유 등)을 그대로 노출
        body = exc.read().decode("utf-8", "replace").strip()
        raise RuntimeError(f"HTTP {exc.code}: {body[:300] or '(빈 응답 본문)'}") from None
    root = ET.fromstring(raw)
    code = (root.findtext(".//resultCode") or "").strip()
    if code not in ("00", "0000"):
        msg = (root.findtext(".//resultMsg") or root.findtext(".//returnAuthMsg") or "").strip()
        raise RuntimeError(f"API error {code or '??'}: {msg or raw[:160]}")

    total = None
    rows = []
    for item in root.iter("item"):
        stat_cd = text(item, "statCd")
        name = text(item, "statCdCntnKor1")
        year = text(item, "year")
        exp_d = num(item, "expDlr")
        imp_d = num(item, "impDlr")
        bal_d = num(item, "balPayments") or (exp_d - imp_d)
        row = {
            "exp": round(exp_d / 1e6),
            "imp": round(imp_d / 1e6),
            "bal": round(bal_d / 1e6),
        }
        if "총계" in (stat_cd, name, year):
            total = row
        elif stat_cd and name:
            rows.append({"cd": stat_cd, "name": name, **row})

    if not rows and total is None:
        return None  # 아직 공표되지 않은 월
    if total is None:
        total = {
            "exp": sum(r["exp"] for r in rows),
            "imp": sum(r["imp"] for r in rows),
            "bal": sum(r["bal"] for r in rows),
        }

    rows.sort(key=lambda r: r["exp"], reverse=True)
    if len(rows) > TOP_N:
        dropped = len(rows) - TOP_N
        kept_exp = sum(r["exp"] for r in rows[:TOP_N])
        print(f"    · {ym}: 상위 {TOP_N}개국 저장, {dropped}개국 생략 "
              f"(생략분 수출 비중 {100 * (1 - kept_exp / max(total['exp'], 1)):.1f}%)",
              file=sys.stderr)
        rows = rows[:TOP_N]
    return total, rows


def main():
    service_key = os.environ.get("CUSTOMS_API_KEY", "").strip()
    if not service_key:
        print("CUSTOMS_API_KEY 미설정 — 시드 데이터를 유지하고 종료합니다.")
        return 0

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    by_ym = {row["ym"]: row for row in data["series"]}
    countries = data.setdefault("countries", {})

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

    updated = 0
    for y, m in month_iter(START_YM, end):
        ym_dash = f"{y:04d}-{m:02d}"
        existing = by_ym.get(ym_dash)
        if existing and ym_dash not in recent and not existing.get("approx"):
            continue
        print(f"  · {ym_dash} 수집 중…", file=sys.stderr)
        try:
            result = fetch_month(service_key, f"{y:04d}{m:02d}")
        except Exception as exc:  # 개별 월 실패는 건너뛰고 계속
            print(f"  ! {ym_dash} 실패: {exc}", file=sys.stderr)
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
        return 0

    series = sorted(by_ym.values(), key=lambda r: r["ym"])
    data["series"] = series
    data["latestYm"] = max((r["ym"] for r in series if not r.get("approx")), default=series[-1]["ym"]) \
        if any(not r.get("approx") for r in series) else series[-1]["ym"]
    data["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if updated:
        data["sourceMode"] = "api"

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (DATA_PATH.parent / "fallback-data.js").write_text(
        "window.FALLBACK_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(f"완료: {updated}개월 갱신, 총 {len(series)}개월.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
