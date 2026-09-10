#!/usr/bin/env python3
"""STARGATE 고속도로 휴게소 입찰 레이더 수집기.

GitHub Actions에서 한국도로공사 웹 서버가 연결 타임아웃을 내는 경우가 있어,
자동 수집의 주 경로는 이미 운영 중인 나라장터 공공데이터 Vercel 프록시를 사용한다.
한국도로공사 자체 공모·매장 공고는 검증된 시드와 원문 링크로 보존한다.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "strategy" / "expressway-restarea-bid" / "data" / "opportunities.json"
KST = timezone(timedelta(hours=9))
PROXY_ROOT = "https://stargate-bid-api.vercel.app/api"
PROXIES = {
    "나라장터 용역 API": f"{PROXY_ROOT}/bid-pblanc-servc",
    "나라장터 공사 API": f"{PROXY_ROOT}/bid-pblanc-cnstwk",
}
TARGET_WORDS = (
    "휴게소", "주유소", "졸음쉼터", "휴게시설", "충전소", "전기차", "매장",
    "푸드", "편의점", "수유실", "화장실", "쉼터", "고속도로 휴게",
)
DIRECT_WORDS = ("데이터", "정보", "시스템", "모니터링", "조사", "컨설팅", "소프트웨어", "통신")


def pick(row: dict, *keys: str) -> str:
    for key in keys:
        value = row.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def ymdhm(dt: datetime) -> str:
    return dt.astimezone(KST).strftime("%Y%m%d%H%M")


def category(title: str) -> str:
    if any(k in title for k in ("전기차", "충전", "스마트", "통신", "정보", "시스템")):
        return "전기차·스마트시설"
    if any(k in title for k in ("창업", "매장", "임대", "편의점", "푸드", "커피")):
        return "전문매장·임대"
    if any(k in title for k in ("용역", "모니터링", "조사", "컨설팅", "데이터")):
        return "용역·데이터"
    return "공사·용역·물품"


def fit(cat: str, title: str) -> str:
    if cat == "용역·데이터" or any(k in title for k in DIRECT_WORDS):
        return "직접"
    if cat == "전문매장·임대":
        return "파트너형"
    if cat == "전기차·스마트시설":
        return "컨소시엄"
    return "직접·컨소시엄"


def score(title: str, org: str, cat: str, deadline: str) -> int:
    s = 58
    if "한국도로공사" in org:
        s += 12
    if "휴게소" in title:
        s += 12
    elif any(k in title for k in TARGET_WORDS):
        s += 7
    if cat in ("용역·데이터", "전기차·스마트시설"):
        s += 7
    if any(k in title for k in DIRECT_WORDS):
        s += 6
    if deadline and deadline != "공고참조":
        s += 2
    return min(s, 98)


def relevant(row: dict) -> bool:
    title = pick(row, "bid_ntce_nm", "bidNtceNm")
    org = " ".join(
        [pick(row, "ntce_instt_nm", "ntceInsttNm"), pick(row, "dminstt_nm", "dminsttNm")]
    )
    return any(k in title for k in TARGET_WORDS) and (
        "한국도로공사" in org or "고속도로" in title or "휴게소" in title
    )


def normalize(row: dict, source: str) -> dict:
    title = pick(row, "bid_ntce_nm", "bidNtceNm") or "나라장터 공고"
    org = pick(row, "dminstt_nm", "dminsttNm", "ntce_instt_nm", "ntceInsttNm") or "공공기관"
    deadline = pick(row, "bid_clse_dt", "bidClseDt") or "공고참조"
    url = pick(row, "bid_ntce_dtl_url", "bidNtceDtlUrl", "bid_ntce_url", "bidNtceUrl")
    cat = category(title)
    method = pick(row, "cntrct_cncls_mthd_nm", "cntrctCnclsMthdNm", "bid_methd_nm", "bidMethdNm")
    price = pick(row, "presmpt_prce", "presmptPrce", "bdgt_amt", "bdgtAmt")
    reason_parts = ["나라장터 공공데이터에서 자동 수집"]
    if method:
        reason_parts.append(f"계약방식 {method}")
    if price:
        reason_parts.append(f"예정/예산금액 {price}")
    reason_parts.append("참가자격·실적·보증조건은 원문 확인")
    return {
        "title": title,
        "organization": org,
        "category": cat,
        "region": "공고참조",
        "deadline": deadline,
        "status": "신규·검토",
        "score": score(title, org, cat, deadline),
        "fit": fit(cat, title),
        "reason": " · ".join(reason_parts),
        "url": url or "https://www.g2b.go.kr/",
        "source": source,
    }


def fetch_g2b(source: str, url: str) -> tuple[list[dict], str]:
    now = datetime.now(KST)
    begin = now - timedelta(days=7)
    collected: list[dict] = []
    total = None
    # 최근 7일을 페이지당 100건, 최대 10페이지 조회한다. 휴게소 관련 공고만 저장한다.
    for page in range(1, 11):
        body = {
            "pageNo": page,
            "pageSize": 100,
            "inqryDiv": "1",
            "inqryBgnDt": ymdhm(begin),
            "inqryEndDt": ymdhm(now),
            "bidNtceNo": "",
            "saveToSupabase": True,
        }
        response = requests.post(url, json=body, timeout=(8, 45), headers={"User-Agent": "STARGATE-restarea-radar/2.0"})
        response.raise_for_status()
        payload = response.json()
        if payload.get("ok") is False:
            raise RuntimeError(payload.get("error") or payload.get("message") or "proxy_error")
        rows = payload.get("items") or []
        if total is None:
            total = int(payload.get("totalCount") or len(rows))
        collected.extend(normalize(row, source) for row in rows if isinstance(row, dict) and relevant(row))
        if not rows or page * 100 >= total:
            break
    return collected, f"ok:{len(collected)} matched/{total or 0} total"


def is_seed(item: dict) -> bool:
    return item.get("source") in {
        "한국도로공사 보도자료",
        "한국도로공사 공지사항",
        "한국도로공사 매장현황",
        "한국도로공사 전자조달",
        "나라장터",
    }


def main() -> None:
    previous = json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else {"opportunities": []}
    seeds = [item for item in previous.get("opportunities", []) if is_seed(item)]
    collected: list[dict] = []
    status = {
        "한국도로공사 자체공고": "linked/manual-seed (Actions direct access timeout)",
    }
    for source, url in PROXIES.items():
        try:
            items, msg = fetch_g2b(source, url)
            collected.extend(items)
            status[source] = msg
        except Exception as exc:
            status[source] = f"error:{type(exc).__name__}"

    merged: dict[tuple[str, str], dict] = {}
    for item in seeds + collected:
        key = (item.get("title", ""), item.get("url", ""))
        merged[key] = item
    items = sorted(merged.values(), key=lambda x: int(x.get("score", 0)), reverse=True)[:250]
    out = {
        "updatedAt": datetime.now(KST).isoformat(timespec="seconds"),
        "sourceStatus": status,
        "opportunities": items,
    }
    DATA.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"saved": len(items), "collected": len(collected), "status": status}, ensure_ascii=False))


if __name__ == "__main__":
    main()
