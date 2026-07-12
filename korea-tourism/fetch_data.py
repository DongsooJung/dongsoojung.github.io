#!/usr/bin/env python3
"""방한 외래관광객(중국·대만·베트남) 월별 통계 수집 스크립트.

공공데이터포털 '출입국관광통계서비스'(data.go.kr/data/15000297)를 호출해
korea-tourism/data.json 을 갱신한다. GitHub Actions에서 매월 실행되며,
API 응답값이 기존 시드 값을 덮어쓴다.

사용법:
    TOUR_API_KEY=<data.go.kr 인증키(Decoding)> python3 fetch_data.py
"""

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

API_URL = "https://apis.data.go.kr/B551011/EdrcntTourismStatsService/getEdrcntTourismStatsList"

# 출입국관광통계서비스 국적 코드 (기술문서 국가코드표 기준)
COUNTRIES = {
    "china": {"natCd": "112", "label": "중국", "match": ["중국", "중 국"]},
    "taiwan": {"natCd": "125", "label": "대만", "match": ["대만", "대 만", "타이완"]},
    "vietnam": {"natCd": "240", "label": "베트남", "match": ["베트남", "베 트 남"]},
}

START_YM = (2024, 1)
DATA_PATH = Path(__file__).parent / "data.json"


def month_range(start, end):
    y, m = start
    while (y, m) <= end:
        yield f"{y:04d}{m:02d}"
        m += 1
        if m > 12:
            y, m = y + 1, 1


def fetch_month(service_key, ym, nat_cd):
    """해당 연월·국적의 방한 입국자 수를 반환한다. 미공표 월이면 None."""
    params = urllib.parse.urlencode({
        "serviceKey": service_key,
        "YM": ym,
        "NAT_CD": nat_cd,
        "ED_CD": "E",  # E: 방한 외래관광객 입국
        "_type": "json",
    })
    req = urllib.request.Request(f"{API_URL}?{params}", headers={"User-Agent": "stargateedu-dashboard"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    if raw.lstrip().startswith("<"):
        # 게이트웨이 오류(등록되지 않은 키 등)는 XML로 내려온다
        raise RuntimeError(f"XML error response for {ym}/{nat_cd}: {raw[:200]}")
    payload = json.loads(raw)
    header = payload["response"]["header"]
    if header.get("resultCode") not in ("0000", "00"):
        raise RuntimeError(f"API error {header.get('resultCode')}: {header.get('resultMsg')}")
    items = payload["response"]["body"].get("items") or {}
    item = items.get("item") if isinstance(items, dict) else None
    if not item:
        return None  # 아직 공표되지 않은 월
    if isinstance(item, list):
        item = item[0]
    return int(item["num"]), str(item.get("natKorNm", ""))


def main():
    service_key = os.environ.get("TOUR_API_KEY", "").strip()
    if not service_key:
        print("TOUR_API_KEY 미설정 — 시드 데이터를 유지하고 종료합니다.")
        return 0

    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    by_ym = {row["ym"]: row for row in data["series"]}

    today = date.today()
    end = (today.year, today.month)
    updated = 0

    for key, info in COUNTRIES.items():
        for ym in month_range(START_YM, end):
            ym_dash = f"{ym[:4]}-{ym[4:]}"
            row = by_ym.setdefault(ym_dash, {"ym": ym_dash, "china": None, "taiwan": None, "vietnam": None})
            try:
                result = fetch_month(service_key, ym, info["natCd"])
            except Exception as exc:  # 개별 월 실패는 건너뛰고 계속
                print(f"  ! {ym_dash} {info['label']}: {exc}", file=sys.stderr)
                continue
            value = None
            if result is not None:
                value, nat_nm = result
                compact = nat_nm.replace(" ", "")
                if not any(m.replace(" ", "") in compact for m in info["match"]):
                    print(f"  !! NAT_CD {info['natCd']} 응답 국적명 불일치: '{nat_nm}' (기대: {info['label']}) — 중단", file=sys.stderr)
                    return 1
            if value is not None and row.get(key) != value:
                row[key] = value
                updated += 1
            if value is not None and key in row.get("approx", []):
                # 언론 공표 요약치(반올림)를 API 정밀치로 교체했으므로 플래그 제거
                row["approx"] = [k for k in row["approx"] if k != key]
                if not row["approx"]:
                    del row["approx"]
            time.sleep(0.15)  # 트래픽 제한 완화

    # 3개국 모두 값이 없는 빈 월은 제거하고 정렬
    data["series"] = sorted(
        (r for r in by_ym.values() if any(r.get(k) is not None for k in COUNTRIES)),
        key=lambda r: r["ym"],
    )
    data["updatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data["sourceMode"] = "api"

    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    fallback = DATA_PATH.parent / "fallback-data.js"
    fallback.write_text("window.FALLBACK_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n", encoding="utf-8")
    print(f"완료: {updated}개 값 갱신, 총 {len(data['series'])}개월.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
