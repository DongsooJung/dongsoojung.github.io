#!/usr/bin/env python3
"""Source-backed, API-key-free-to-client IPO disclosure calendar.

DART estkRs is an equity securities registration API. Its subscription dates
must NOT be labeled as confirmed public IPO schedules or KRX approval.
Run from GitHub Actions only; API key is never written or logged.
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
from datetime import datetime, timedelta, timezone, date
from pathlib import Path
from xml.etree import ElementTree as ET

API_BASE = "https://opendart.fss.or.kr/api/"
ROOT = Path(__file__).resolve().parents[1] / "unlisted-stocks" / "data"
KST = timezone(timedelta(hours=9))
MAX_PAGES = 8
MAX_ISSUERS = 35
MAX_ITEMS = 100
EQUITY_RE = re.compile(r"(?:증권신고서|투자설명서)\s*\(\s*지분증권\s*\)")

class SourceError(Exception):
    pass

def api_get(key, endpoint, params, binary=False):
    query = urllib.parse.urlencode({"crtfc_key": key, **params})
    req = urllib.request.Request(API_BASE + endpoint + "?" + query,
                                 headers={"User-Agent": "stargate-ipo-calendar/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=45) as res:
            raw = res.read()
    except Exception as exc:
        # Error URLs contain the secret key; never print the exception object.
        raise SourceError(f"{endpoint}: network failure ({type(exc).__name__})") from None
    if binary:
        return raw
    try:
        obj = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeError):
        raise SourceError(f"{endpoint}: malformed response") from None
    if str(obj.get("status")) not in ("000", "013"):
        raise SourceError(f"{endpoint}: status={obj.get('status')}")
    return obj

def normalize_name(name):
    return re.sub(r"\s+|\(주\)|㈜|주식회사", "", name or "").lower()

def corp_index(archive):
    try:
        with zipfile.ZipFile(io.BytesIO(archive)) as z:
            name = next(x for x in z.namelist() if x.lower().endswith(".xml"))
            xml = z.read(name)
    except (zipfile.BadZipFile, StopIteration, KeyError):
        raise SourceError("corpCode.xml: malformed archive") from None
    idx = {}
    for row in ET.fromstring(xml).findall("list"):
        d = {p.tag: (p.text or "").strip() for p in row}
        if re.fullmatch(r"\d{8}", d.get("corp_code", "")):
            idx.setdefault(normalize_name(d.get("corp_name", "")), set()).add(d["corp_code"])
    return idx

def parse_day(raw):
    """Accept one unambiguous ISO-ish date only, refuse approximations."""
    raw = str(raw or "").strip()
    match = re.fullmatch(r"(\d{4})[-./]\s*(\d{1,2})[-./]\s*(\d{1,2})\.?", raw)
    if not match:
        match = re.fullmatch(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일", raw)
    if match:
        y,m,d = [int(x) for x in match.groups()]
    elif re.fullmatch(r"\d{8}", raw):
        y,m,d = int(raw[:4]),int(raw[4:6]),int(raw[6:])
    else:
        return None
    try:
        result = date(y,m,d)
        return result.isoformat() if 2015 <= y <= 2100 else None
    except ValueError:
        return None

def parse_subscription_dates(raw):
    """One date or two explicit dates; no guesses on descriptive text."""
    raw = str(raw or "").strip()
    direct = parse_day(raw)
    if direct:
        return direct, direct
    # DART often uses "YYYY.MM.DD ~ YYYY.MM.DD".
    parts = re.split(r"\s*(?:~|∼|～|부터|에서| - )\s*", raw)
    if len(parts) == 2:
        left,right = parse_day(parts[0]),parse_day(parts[1])
        if left and right and left <= right:
            return left,right
    return None,None

def registration_filings(key, now):
    start = now - timedelta(days=90)
    rows = []
    total_pages = 1
    pages_checked = 0
    for page in range(1, MAX_PAGES + 1):
        obj = api_get(key,"list.json", {
            "bgn_de": start.strftime("%Y%m%d"), "end_de": now.strftime("%Y%m%d"),
            "corp_cls": "E", "pblntf_ty": "C",
            "sort": "date", "sort_mth": "desc",
            "page_no": str(page), "page_count": "100"
        })
        pages_checked = page
        if obj.get("status") == "013":
            break
        total_pages = int(obj.get("total_page") or 1)
        for entry in obj.get("list") or []:
            rcp = str(entry.get("rcept_no",""))
            title = str(entry.get("report_nm","")).strip()
            if not re.fullmatch(r"\d{14}",rcp) or not EQUITY_RE.search(title):
                continue
            if str(entry.get("corp_cls","")) not in ("E",""):
                continue
            rows.append({
                "name": str(entry.get("corp_name",""))[:120],
                "report": title[:180],
                "rcept_no": rcp,
                "received": str(entry.get("rcept_dt",""))[:8],
            })
        if page >= total_pages:
            break
    return list({x["rcept_no"]:x for x in rows}.values()), {
        "start":start.date().isoformat(),"end":now.date().isoformat(),
        "pages_checked":pages_checked,"total_pages":total_pages,
        "truncated":pages_checked < total_pages
    }

def normalize_prospectus(payload, allowed_receipts, issuer_code):
    """DART estkRs group: general matters, security types, underwriting."""
    if str(payload.get("status")) == "013":
        return []
    groups = payload.get("group") or []
    general = {}
    securities = {}
    for g in groups:
        if not isinstance(g, dict):
            continue
        title = str(g.get("title",""))
        for entry in g.get("list") or []:
            if not isinstance(entry,dict):
                continue
            rcp = str(entry.get("rcept_no",""))
            if rcp not in allowed_receipts or not re.fullmatch(r"\d{14}",rcp):
                continue
            if "일반사항" in title:
                general[rcp] = entry
            elif "증권의종류" in title:
                securities.setdefault(rcp,[]).append(entry)
    out = []
    for rcp, base in general.items():
        if str(base.get("corp_code","")) != issuer_code:
            continue
        if str(base.get("corp_cls","")) != "E":
            continue
        raw = str(base.get("sbd","")).strip()[:120]
        start,end = parse_subscription_dates(raw)
        payment = parse_day(base.get("pymd",""))
        price_types = [
            str(it.get("slprc","")).strip()[:70]
            for it in securities.get(rcp,[])
            if str(it.get("slprc","")).strip() not in ("","-")
        ]
        # Avoid pretending indicative price is final IPO offer price.
        out.append({
            "rcept_no":rcp,
            "corp_code":issuer_code,
            "name":str(base.get("corp_name",""))[:120],
            "subscription_raw":raw or None,
            "subscription_start":start,
            "subscription_end":end,
            "payment_date":payment,
            "offering_price_raw":price_types[0] if price_types else None,
            "source":"OpenDART estkRs",
            "ipo_status":"unconfirmed",
            "krx_review_status":"unverified",
            "url":"https://dart.fss.or.kr/dsaf001/main.do?rcpNo="+rcp,
        })
    return out

def create_calendar(key, today):
    filings, coverage = registration_filings(key,today)
    candidates = {}
    for item in filings:
        name = normalize_name(item["name"])
        candidates.setdefault(name, []).append(item["rcept_no"])
    selected = list(candidates)[:MAX_ISSUERS]
    registry = corp_index(api_get(key,"corpCode.xml",{},binary=True))
    events=[]
    checked=0
    missing=0
    for name in selected:
        matches = registry.get(name,set())
        if len(matches)!=1:
            missing+=1
            continue
        code = next(iter(matches))
        checked+=1
        payload = api_get(key,"estkRs.json",{
            "corp_code":code,
            "bgn_de":(today-timedelta(days=90)).strftime("%Y%m%d"),
            "end_de":today.strftime("%Y%m%d"),
        })
        events.extend(normalize_prospectus(payload,set(candidates[name]),code))
    # Each registration receipt appears once; never combine different filings.
    unique={x["rcept_no"]:x for x in events}
    ordered=sorted(unique.values(),key=lambda x:x["rcept_no"],reverse=True)[:MAX_ITEMS]
    return {
        "schema":1,"source":"OpenDART estkRs/list",
        "status":"ok","updated_at":today.isoformat(timespec="seconds"),
        "coverage":coverage,
        "issuer_queries":checked,"unmatched_issuer_count":missing,
        "issuer_limit_reached":len(candidates)>MAX_ISSUERS,
        "records":ordered,
        "disclaimer":"지분증권 발행·청약일 정보이며 한국거래소 상장예비심사 청구/승인 또는 IPO 확정 정보가 아닙니다.",
    }

def main():
    key=(os.getenv("OPENDART_API_KEY") or os.getenv("DART_API_KEY") or "").strip()
    if not key:
        print("OpenDART key missing. Existing IPO calendar retained.")
        return 0
    if not re.fullmatch(r"[A-Za-z0-9]{40}",key):
        raise SourceError("OpenDART key has invalid format")
    today=datetime.now(KST)
    data=create_calendar(key,today)
    ROOT.mkdir(parents=True,exist_ok=True)
    (ROOT/"ipo-calendar.json").write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"IPO disclosure snapshot collected: {len(data['records'])} receipts; "
          f"issuer calls={data['issuer_queries']}; truncated={data['coverage']['truncated']}")
    return 0

if __name__=="__main__":
    try:
        sys.exit(main())
    except SourceError as exc:
        print("IPO disclosure collection failed: "+str(exc),file=sys.stderr)
        sys.exit(1)
