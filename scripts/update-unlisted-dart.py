#!/usr/bin/env python3
"""Publish sourced OpenDART financial disclosures and equity-filing watchlist.

Executed only in GitHub Actions. The API key never enters the browser, logs,
generated JSON, or the repository. No key = keep existing snapshot unchanged.
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1] / "unlisted-stocks" / "data"
API = "https://opendart.fss.or.kr/api/"
KST = timezone(timedelta(hours=9))
TARGETS = (
    ("아리바이오", "192230"),
    ("SK에코플랜트", "003340"),
    ("LS전선", "104230"),
    ("아이엠증권", "030010"),
    ("삼성메디슨", "018360"),
)
# Exact account names. This intentionally skips ambiguous/custom account labels.
ACCOUNTS = {
    "revenue": ("매출액", "영업수익", "수익(매출액)", "매출액(영업수익)"),
    "operating_profit": ("영업이익", "영업이익(손실)", "영업손익"),
    "net_income": ("당기순이익", "당기순이익(손실)", "당기순손익"),
    "assets": ("자산총계",),
    "liabilities": ("부채총계",),
    "equity": ("자본총계",),
}
STATEMENT = {
    "revenue": ("IS", "CIS"),
    "operating_profit": ("IS", "CIS"),
    "net_income": ("IS", "CIS"),
    "assets": ("BS",),
    "liabilities": ("BS",),
    "equity": ("BS",),
}


class DataError(Exception):
    pass


def normalize_name(s: str) -> str:
    return re.sub(r"\s+|주식회사|\(주\)|㈜", "", s or "").lower()


def parse_amount(raw: object) -> int | None:
    if raw is None:
        return None
    s = str(raw).replace(",", "").strip()
    if not s or s in {"-", "--"}:
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    try:
        number = int(s)
    except ValueError:
        return None
    return -number if neg else number


def parse_metrics(rows: list[dict]) -> dict[str, int | None]:
    output = {}
    for metric, aliases in ACCOUNTS.items():
        candidates = []
        for row in rows:
            if row.get("sj_div") not in STATEMENT[metric]:
                continue
            name = str(row.get("account_nm", "")).strip()
            name = name.replace(" ", "")
            # Keep exact aliases and avoid "subtotal" or multi-account matches.
            score = next(
                (index for index, alias in enumerate(aliases)
                 if name == alias.replace(" ", "")),
                None,
            )
            if score is None:
                continue
            amt = parse_amount(row.get("thstrm_amount"))
            if amt is None:
                continue
            candidates.append((score, amt))
        if not candidates:
            output[metric] = None
        else:
            best = min(x[0] for x in candidates)
            distinct = {x[1] for x in candidates if x[0] == best}
            output[metric] = distinct.pop() if len(distinct) == 1 else None
    return output


def api_get(endpoint: str, params: dict[str, str], key: str, binary=False):
    query = urllib.parse.urlencode({"crtfc_key": key, **params})
    request = urllib.request.Request(
        API + endpoint + "?" + query,
        headers={"User-Agent": "stargate-unlisted-research/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            raw = response.read()
    except Exception as exc:
        # Never print exception URL: query string includes secret.
        raise DataError(f"{endpoint}: upstream network error ({type(exc).__name__})") from None
    if binary:
        return raw
    try:
        data = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise DataError(f"{endpoint}: invalid JSON response") from None
    status = str(data.get("status", ""))
    if status not in ("000", "013"):
        raise DataError(f"{endpoint}: upstream status={status}")
    return data


def corporations(key: str) -> dict[str, list[dict]]:
    zipped = api_get("corpCode.xml", {}, key, binary=True)
    try:
        with zipfile.ZipFile(io.BytesIO(zipped)) as archive:
            name = next(n for n in archive.namelist() if n.lower().endswith(".xml"))
            xml = archive.read(name)
    except (ValueError, zipfile.BadZipFile, StopIteration, KeyError):
        raise DataError("corpCode.xml: invalid archive") from None
    by_name = defaultdict(list)
    for element in ET.fromstring(xml).findall("list"):
        row = {child.tag: (child.text or "").strip() for child in element}
        if re.fullmatch(r"\d{8}", row.get("corp_code", "")):
            by_name[normalize_name(row.get("corp_name", ""))].append(row)
    return by_name


def available_reports(today: datetime):
    # The full-year report for the previous calendar year is generally
    # available only after the March filing period, never assume current FY.
    annual = today.year - 1 if today.month >= 4 else today.year - 2
    reports = [
        {"year": annual, "report_code": "11011", "period": f"{annual} FY"},
        {"year": annual - 1, "report_code": "11011", "period": f"{annual-1} FY"},
    ]
    if (today.month, today.day) >= (8, 18):
        reports.insert(0, {"year": today.year, "report_code": "11012", "period": f"{today.year} H1"})
    elif (today.month, today.day) >= (5, 18):
        reports.insert(0, {"year": today.year, "report_code": "11013", "period": f"{today.year} Q1"})
    # Avoid inferring a Q3 result before reporting deadlines.
    if (today.month, today.day) >= (11, 18):
        reports.insert(0, {"year": today.year, "report_code": "11014", "period": f"{today.year} Q3"})
    return reports


def financials_for_company(key: str, name: str, stock_code: str,
                           registry: dict[str, list[dict]], reports: list[dict]):
    matches = registry.get(normalize_name(name), [])
    entry = {
        "name": name, "market_code": stock_code, "corp_code": None,
        "match": "not_found", "periods": [],
    }
    if len(matches) != 1:
        entry["match"] = "ambiguous" if matches else "not_found"
        return entry
    corp_code = matches[0]["corp_code"]
    entry["corp_code"] = corp_code
    entry["match"] = "unique_exact_name"
    for report in reports:
        # CFS (consolidated) preferred; OFS is a fallback, not an additive total.
        for div in ("CFS", "OFS"):
            payload = api_get(
                "fnlttSinglAcntAll.json",
                {"corp_code": corp_code, "bsns_year": str(report["year"]),
                 "reprt_code": report["report_code"], "fs_div": div},
                key,
            )
            if payload.get("status") == "013" or not payload.get("list"):
                continue
            metrics = parse_metrics(payload["list"])
            if not any(v is not None for v in metrics.values()):
                continue
            entry["periods"].append({
                **report, "fs_div": div, "metrics": metrics,
                "source": "OpenDART fnlttSinglAcntAll",
            })
            break
    return entry


def recent_equity_filings(key: str, today: datetime):
    # E = other/unlisted issuers; C001 = equity securities filings.
    # Such a filing is NOT proof of a pending IPO.
    start = today - timedelta(days=60)
    filings = []
    for page in range(1, 5):
        payload = api_get(
            "list.json",
            {"bgn_de": start.strftime("%Y%m%d"), "end_de": today.strftime("%Y%m%d"),
             "corp_cls": "E", "pblntf_ty": "C", "pblntf_detail_ty": "C001",
             "last_reprt_at": "Y", "sort": "date", "sort_mth": "desc",
             "page_no": str(page), "page_count": "100"},
            key,
        )
        if payload.get("status") == "013":
            break
        for row in payload.get("list") or []:
            rcept_no = str(row.get("rcept_no", ""))
            if not re.fullmatch(r"\d{14}", rcept_no):
                continue
            filings.append({
                "name": str(row.get("corp_name", ""))[:120],
                "report": str(row.get("report_nm", ""))[:180],
                "received": str(row.get("rcept_dt", ""))[:8],
                "rcept_no": rcept_no,
                "url": "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=" + rcept_no,
                "stage": "equity_filing_not_ipo_confirmation",
            })
        if page >= int(payload.get("total_page") or 1):
            break
    return list({item["rcept_no"]: item for item in filings}.values())[:100]


def main() -> int:
    key = (os.getenv("OPENDART_API_KEY") or os.getenv("DART_API_KEY") or "").strip()
    if not key:
        print("OpenDART secret not configured: retain existing snapshots.")
        return 0
    if not re.fullmatch(r"[A-Za-z0-9]{40}", key):
        raise DataError("OpenDART secret has invalid format")
    today = datetime.now(KST)
    registry = corporations(key)
    reports = available_reports(today)
    rows = [
        financials_for_company(key, name, code, registry, reports)
        for name, code in TARGETS
    ]
    filings = recent_equity_filings(key, today)
    output = {
        "schema": 1, "source": "OpenDART", "updated_at": today.isoformat(timespec="seconds"),
        "status": "ok", "financials": rows,
        "equity_filings": filings,
        "equity_window": {"start": (today - timedelta(days=60)).strftime("%Y-%m-%d"),
                          "end": today.strftime("%Y-%m-%d")},
        "notes": [
            "Only unique exact corporate-name matches are linked; stock codes alone cannot identify DART corp_code.",
            "Financial data is returned only when an eligible report exists.",
            "Equity filings from non-listed issuers are NOT confirmed IPO applications or approvals.",
        ],
    }
    ROOT.mkdir(parents=True, exist_ok=True)
    destination = ROOT / "opendart.json"
    destination.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Published {len(rows)} company lookups and {len(filings)} disclosure records.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DataError as err:
        print(f"OpenDART snapshot failed: {err}", file=sys.stderr)
        sys.exit(1)
