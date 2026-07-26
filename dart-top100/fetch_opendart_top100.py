#!/usr/bin/env python3
"""Refresh the embedded OpenDART data in dart-top100/index.html.

The API key is read only from OPENDART_API_KEY (or DART_API_KEY) and is never
written to the repository or printed to logs.
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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, NoReturn
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parent
INDEX_PATH = ROOT / "index.html"
DATA_DIR = ROOT / "data"
API_BASE = "https://opendart.fss.or.kr/api"
DEFAULT_BUSINESS_YEAR = 2026
REPORT_CODES = {
    "Q1": "11013",
    "H1": "11012",
    "Q3": "11014",
    "FY": "11011",
}

# DART company names occasionally differ from the dashboard's display names.
COMPANY_ALIASES = {
    "F&F": ("에프앤에프",),
    "HD현대": ("에이치디현대",),
    "HD한국조선해양": ("에이치디한국조선해양",),
    "HD현대중공업": ("에이치디현대중공업",),
    "HD현대인프라코어": ("에이치디현대인프라코어",),
    "HD현대건설기계": ("에이치디현대건설기계",),
    "포스코홀딩스": ("POSCO홀딩스",),
    "KT": ("케이티",),
    "KT&G": ("케이티앤지",),
    "SK": ("에스케이",),
    "GS": ("지에스",),
    "CJ": ("씨제이",),
    "LS": ("엘에스",),
    "OCI홀딩스": ("오씨아이홀딩스",),
}

REVENUE_EXACT = (
    "매출액",
    "수익매출액",
    "영업수익",
    "영업수익매출액",
    "총영업수익",
    "순영업수익",
    "영업수익합계",
    "보험영업수익",
    "수익",
)
OPERATING_PROFIT_EXACT = (
    "영업이익",
    "영업이익손실",
    "영업손익",
    "영업손익손실",
)


def fail(message: str) -> NoReturn:
    print(f"error: {message}", file=sys.stderr)
    raise SystemExit(1)


def api_key() -> str:
    key = (os.environ.get("OPENDART_API_KEY") or os.environ.get("DART_API_KEY") or "").strip()
    if not key:
        fail("OPENDART_API_KEY GitHub Actions secret is not configured")
    if not re.fullmatch(r"[0-9A-Za-z]{40}", key):
        fail("OpenDART API key must be a 40-character value")
    return key


def request_bytes(endpoint: str, params: dict[str, str], *, timeout: int = 60) -> bytes:
    query = urllib.parse.urlencode(params)
    request = urllib.request.Request(
        f"{API_BASE}/{endpoint}?{query}",
        headers={"User-Agent": "stargateedu-dart-top100/1.0"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except Exception as exc:  # URL is intentionally omitted so the key cannot leak.
        fail(f"OpenDART request failed for {endpoint}: {exc.__class__.__name__}")


def request_json(endpoint: str, params: dict[str, str]) -> dict[str, Any]:
    raw = request_bytes(endpoint, params)
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        fail(f"OpenDART returned an invalid JSON response for {endpoint}")
    status = str(payload.get("status", ""))
    if status not in {"000", "013"}:
        fail(f"OpenDART {endpoint} failed with status {status}: {payload.get('message', 'unknown error')}")
    return payload


def normalize_name(value: str) -> str:
    value = value.strip().upper()
    for token in ("주식회사", "㈜", "(주)", "（주）"):
        value = value.replace(token.upper(), "")
    return re.sub(r"[^0-9A-Z가-힣]", "", value)


def normalize_account(value: str) -> str:
    return re.sub(r"[^0-9A-Z가-힣]", "", value.strip().upper())


def parse_amount(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if text in {"", "-", "--"}:
        return None
    negative = text.startswith("(") and text.endswith(")")
    if negative:
        text = text[1:-1]
    try:
        number = int(float(text))
    except ValueError:
        return None
    return -number if negative else number


def load_embedded_data() -> tuple[str, dict[str, Any], int, int]:
    html = INDEX_PATH.read_text(encoding="utf-8")
    start_marker = "const DATA = "
    end_marker = ";\n\n'use strict';"
    start = html.find(start_marker)
    if start < 0:
        fail("const DATA block was not found in dart-top100/index.html")
    json_start = start + len(start_marker)
    json_end = html.find(end_marker, json_start)
    if json_end < 0:
        fail("the end of the const DATA block was not found")
    try:
        data = json.loads(html[json_start:json_end])
    except json.JSONDecodeError as exc:
        fail(f"embedded DATA is invalid JSON: {exc}")
    return html, data, json_start, json_end


def load_corporations(key: str) -> list[dict[str, str]]:
    archive = request_bytes("corpCode.xml", {"crtfc_key": key})
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
            xml_name = next(name for name in zipped.namelist() if name.lower().endswith(".xml"))
            xml_bytes = zipped.read(xml_name)
    except (zipfile.BadZipFile, StopIteration, KeyError):
        fail("OpenDART corpCode.xml did not return the expected ZIP/XML file")

    root = ElementTree.fromstring(xml_bytes)
    corporations: list[dict[str, str]] = []
    for item in root.findall("list"):
        row = {child.tag: (child.text or "").strip() for child in item}
        if row.get("corp_code") and row.get("corp_name"):
            corporations.append(row)
    return corporations


def resolve_companies(
    seeds: Iterable[dict[str, Any]], corporations: list[dict[str, str]]
) -> tuple[list[dict[str, Any]], list[str]]:
    # Prefer listed companies when duplicate normalized names exist.
    by_name: dict[str, list[dict[str, str]]] = defaultdict(list)
    for corporation in corporations:
        by_name[normalize_name(corporation["corp_name"])].append(corporation)

    resolved: list[dict[str, Any]] = []
    unresolved: list[str] = []
    for seed in seeds:
        display_name = str(seed["corp_name"])
        candidates = [display_name, *COMPANY_ALIASES.get(display_name, ())]
        matches: list[dict[str, str]] = []
        for candidate in candidates:
            matches.extend(by_name.get(normalize_name(candidate), ()))
        if not matches:
            unresolved.append(display_name)
            continue
        matches.sort(
            key=lambda row: (
                bool(row.get("stock_code")),
                row.get("modify_date", ""),
            ),
            reverse=True,
        )
        match = matches[0]
        resolved.append(
            {
                "display_name": display_name,
                "corp_name": match["corp_name"],
                "corp_code": match["corp_code"],
                "stock_code": match.get("stock_code") or None,
            }
        )
    return resolved, unresolved


def account_score(account_name: str, metric: str) -> int | None:
    name = normalize_account(account_name)
    exact = REVENUE_EXACT if metric == "revenue" else OPERATING_PROFIT_EXACT
    if name in exact:
        return exact.index(name)

    if metric == "revenue":
        if "영업외수익" in name or "금융수익" in name or "기타영업수익" in name:
            return None
        if "매출액" in name:
            return 20
        if name.endswith("영업수익"):
            return 25
    else:
        if "영업외" in name:
            return None
        if "영업이익" in name or "영업손익" in name:
            return 20
    return None


def choose_row(rows: list[dict[str, Any]], metric: str, fs_div: str) -> dict[str, Any] | None:
    choices: list[tuple[int, int, int, dict[str, Any]]] = []
    for row in rows:
        if row.get("fs_div") != fs_div or row.get("sj_div") not in {"IS", "CIS"}:
            continue
        score = account_score(str(row.get("account_nm", "")), metric)
        if score is None:
            continue
        amount = parse_amount(row.get("thstrm_add_amount"))
        if amount is None:
            amount = parse_amount(row.get("thstrm_amount"))
        magnitude = abs(amount or 0)
        try:
            order = int(str(row.get("ord", "999999")).replace(",", ""))
        except ValueError:
            order = 999999
        choices.append((score, order, -magnitude, row))
    return min(choices, default=(0, 0, 0, None))[-1]


def fetch_reports(key: str, year: int, corp_codes: list[str]) -> dict[str, dict[str, list[dict[str, Any]]]]:
    grouped: dict[str, dict[str, list[dict[str, Any]]]] = {
        period: defaultdict(list) for period in REPORT_CODES
    }
    codes = ",".join(corp_codes)
    for period, report_code in REPORT_CODES.items():
        payload = request_json(
            "fnlttMultiAcnt.json",
            {
                "crtfc_key": key,
                "corp_code": codes,
                "bsns_year": str(year),
                "reprt_code": report_code,
            },
        )
        for row in payload.get("list") or []:
            grouped[period][str(row.get("corp_code", ""))].append(row)
    return grouped


def metric_periods(
    report_rows: dict[str, list[dict[str, Any]]], metric: str
) -> tuple[dict[str, int | None], str | None]:
    selected: dict[str, dict[str, Any] | None] = {}
    selected_fs: str | None = None
    for fs_div in ("CFS", "OFS"):
        candidate = {
            period: choose_row(rows, metric, fs_div)
            for period, rows in report_rows.items()
        }
        if any(candidate.values()):
            selected = candidate
            selected_fs = fs_div
            break

    if not selected:
        return {"Q1": None, "Q2": None, "Q3": None, "Q4": None}, None

    def current(period: str) -> int | None:
        row = selected.get(period)
        return parse_amount(row.get("thstrm_amount")) if row else None

    def cumulative(period: str) -> int | None:
        row = selected.get(period)
        if not row:
            return None
        accumulated = parse_amount(row.get("thstrm_add_amount"))
        return accumulated if accumulated is not None else parse_amount(row.get("thstrm_amount"))

    q1 = cumulative("Q1")
    h1 = cumulative("H1")
    q3_cumulative = cumulative("Q3")
    annual = cumulative("FY")

    q2_current = current("H1")
    if h1 is not None and q1 is not None:
        derived = h1 - q1
        if q2_current is None or abs((q1 + q2_current) - h1) > max(1_000_000, abs(h1) * 0.01):
            q2_current = derived

    q3_current = current("Q3")
    if q3_cumulative is not None and h1 is not None:
        derived = q3_cumulative - h1
        if q3_current is None or abs((h1 + q3_current) - q3_cumulative) > max(1_000_000, abs(q3_cumulative) * 0.01):
            q3_current = derived

    q4 = annual - q3_cumulative if annual is not None and q3_cumulative is not None else None
    return {"Q1": q1, "Q2": q2_current, "Q3": q3_current, "Q4": q4}, selected_fs


def sum_periods(companies: list[dict[str, Any]], field: str) -> dict[str, int | None]:
    totals: dict[str, int | None] = {}
    for quarter in ("Q1", "Q2", "Q3", "Q4"):
        values = [
            int(company[field][quarter])
            for company in companies
            if company[field].get(quarter) is not None
        ]
        totals[quarter] = sum(values) if values else None
    return totals


def main() -> None:
    key = api_key()
    try:
        year = int(os.environ.get("DART_BUSINESS_YEAR", str(DEFAULT_BUSINESS_YEAR)))
    except ValueError:
        fail("DART_BUSINESS_YEAR must be a four-digit year")
    if not 2015 <= year <= datetime.now(timezone.utc).year:
        fail("DART_BUSINESS_YEAR is outside OpenDART's supported range")

    html, old_data, json_start, json_end = load_embedded_data()
    seeds = old_data.get("companies") or []
    if not seeds:
        fail("the embedded DATA block contains no seed companies")

    corporations = load_corporations(key)
    resolved, unresolved = resolve_companies(seeds, corporations)
    if not resolved:
        fail("none of the seed company names could be mapped to OpenDART corporation codes")

    reports = fetch_reports(key, year, [company["corp_code"] for company in resolved])
    companies: list[dict[str, Any]] = []
    missing_financials: list[str] = []
    for company in resolved:
        company_reports = {
            period: reports[period].get(company["corp_code"], [])
            for period in REPORT_CODES
        }
        revenue, revenue_fs = metric_periods(company_reports, "revenue")
        operating_profit, op_fs = metric_periods(company_reports, "operating_profit")
        revenue_annual = sum(value for value in revenue.values() if value is not None)
        operating_profit_annual = sum(value for value in operating_profit.values() if value is not None)
        if not any(value is not None for value in revenue.values()):
            missing_financials.append(company["display_name"])
            continue
        companies.append(
            {
                "rank": 0,
                "corp_name": company["display_name"],
                "corp_code": company["corp_code"],
                "stock_code": company["stock_code"],
                "fs_div": revenue_fs or op_fs or "CFS",
                "revenue": revenue,
                "operating_profit": operating_profit,
                "revenue_annual": revenue_annual,
                "operating_profit_annual": operating_profit_annual,
            }
        )

    companies.sort(key=lambda row: row["revenue_annual"], reverse=True)
    for rank, company in enumerate(companies, start=1):
        company["rank"] = rank

    skipped = len(unresolved) + len(missing_financials)
    available_quarters = [
        quarter
        for quarter in ("Q1", "Q2", "Q3", "Q4")
        if any(
            company["revenue"].get(quarter) is not None
            or company["operating_profit"].get(quarter) is not None
            for company in companies
        )
    ]
    note = (
        "OpenDART 정기보고서 기준. 연결재무제표 우선, 미제공 시 별도재무제표를 사용하며 "
        "분기 수치는 누적 금액을 검증·차감해 계산했습니다."
    )
    if year == datetime.now(timezone.utc).year and len(available_quarters) < 4:
        quarter_names = {"Q1": "1분기", "Q2": "2분기", "Q3": "3분기", "Q4": "4분기"}
        disclosed = "·".join(quarter_names[quarter] for quarter in available_quarters) or "없음"
        note += (
            f" {year}년은 현재 공시된 {disclosed} 데이터만 반영했으며, "
            "미공시 분기는 빈값으로 표시합니다."
        )
    if skipped:
        note += f" 법인코드 또는 재무정보를 확인하지 못한 {skipped}개 기업은 합산에서 제외했습니다."

    new_data = {
        "meta": {
            "source": "OpenDART",
            "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
            "year": year,
            "unit": "KRW",
            "available_quarters": available_quarters,
            "note": note,
        },
        "totals": {
            "revenue": sum_periods(companies, "revenue"),
            "operating_profit": sum_periods(companies, "operating_profit"),
        },
        "companies": companies,
    }

    replacement = json.dumps(new_data, ensure_ascii=False, separators=(",", ":"))
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    data_path = DATA_DIR / f"{year}.json"
    data_path.write_text(replacement + "\n", encoding="utf-8")

    # The landing page keeps the current default year embedded for a fast load.
    # Historical runs only update their year-specific JSON file.
    if year == DEFAULT_BUSINESS_YEAR:
        INDEX_PATH.write_text(html[:json_start] + replacement + html[json_end:], encoding="utf-8")
    print(
        f"Updated {data_path.relative_to(ROOT)} for {year}: "
        f"{len(companies)} companies, {skipped} skipped"
    )


if __name__ == "__main__":
    main()
