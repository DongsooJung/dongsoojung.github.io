#!/usr/bin/env python3
"""Optional contract-approved KIND review events feed.

No scraping. Configure a licensed JSON feed in Actions secrets and explicitly
allow its hostname. Until then, leave the status as not_connected.
"""
from __future__ import annotations
import ipaddress
import json
import os
import re
import socket
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta, date
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "unlisted-stocks/data/kind-verified.json"
KST = timezone(timedelta(hours=9))
STAGES = {"review_applied", "review_approved", "review_withdrawn", "review_rejected", "listed"}
OFFICIAL_HOSTS = {"kind.krx.co.kr", "listing.krx.co.kr", "www.krx.co.kr", "krx.co.kr"}
MAX_BYTES = 2_000_000

class FeedError(Exception):
    pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise FeedError("Feed redirects are disabled")

def check_remote_url(uri, expected_host, official=False):
    parsed=urllib.parse.urlsplit(uri)
    host=(parsed.hostname or "").lower()
    if parsed.scheme!="https" or parsed.port not in (None,443) or parsed.username or parsed.password:
        raise FeedError("Only HTTPS URL with standard port and no credentials is accepted")
    if parsed.fragment:
        raise FeedError("URL fragments are not accepted")
    if not host:
        raise FeedError("A valid hostname is required")
    if official:
        if host not in OFFICIAL_HOSTS:
            raise FeedError("Evidence URL must point to an official KRX host")
        return host
    if host!=expected_host or host in {"localhost", "127.0.0.1"}:
        raise FeedError("Feed hostname does not match explicit allowlist")
    try:
        ipaddress.ip_address(host)
        raise FeedError("IP literal hosts are forbidden")
    except ValueError:
        pass
    if not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+",host):
        raise FeedError("Hostname is invalid")
    # Do not connect to internal network endpoints even if allowlisted.
    try:
        addresses=socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)
    except (socket.gaierror,OSError):
        raise FeedError("Feed DNS lookup failed") from None
    if not addresses:
        raise FeedError("No DNS results")
    for result in addresses:
        ip=ipaddress.ip_address(result[4][0])
        if not ip.is_global:
            raise FeedError("Feed resolves to a non-public address")
    return host

def validate_payload(payload):
    if not isinstance(payload,dict) or not isinstance(payload.get("records"),list):
        raise FeedError("Feed must be an object containing a records array")
    # Metadata must be explicit; do not turn received/updated time into an event time.
    records=[]
    for row in payload["records"][:300]:
        if not isinstance(row,dict):
            raise FeedError("Each record must be an object")
        name=str(row.get("name","")).strip()
        stage=str(row.get("stage",""))
        when=str(row.get("announcement_date",""))
        url=str(row.get("source_url",""))
        market=str(row.get("market","")).strip()
        if not 1<=len(name)<=120 or stage not in STAGES or not re.fullmatch(r"\d{4}-\d{2}-\d{2}",when):
            raise FeedError("Name, stage, or announcement date invalid")
        try:
            date.fromisoformat(when)
        except ValueError:
            raise FeedError("Invalid announcement date") from None
        check_remote_url(url, "", official=True)
        records.append({"name":name,"stage":stage,"announcement_date":when,
                        "market":market[:20],"source_url":url,
                        "source":"KRX KIND verified feed"})
    return records

def collect():
    uri=(os.getenv("IPO_KIND_FEED_URL") or "").strip()
    expected=(os.getenv("IPO_KIND_ALLOWED_HOST") or "").strip().lower()
    token=(os.getenv("IPO_KIND_FEED_TOKEN") or "").strip()
    if not uri:
        print("No contract-approved KIND feed configured; last snapshot unchanged.")
        return 0
    if not expected:
        raise FeedError("IPO_KIND_ALLOWED_HOST must be set explicitly")
    check_remote_url(uri,expected)
    headers={"Accept":"application/json","User-Agent":"stargate-ipo-feed/1.0"}
    if token:
        headers["Authorization"]="Bearer "+token
    opener=urllib.request.build_opener(NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        res=opener.open(urllib.request.Request(uri,headers=headers),timeout=30)
        raw=res.read(MAX_BYTES+1)
    except Exception as exc:
        # A URL or token must never be printed in logs.
        raise FeedError(f"Upstream feed request failed ({type(exc).__name__})") from None
    if len(raw)>MAX_BYTES:
        raise FeedError("Feed exceeds size limit")
    try:
        src=json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError,ValueError):
        raise FeedError("Feed is not valid UTF-8 JSON") from None
    records=validate_payload(src)
    result={"schema":1,"source":"KRX KIND contract-approved feed",
            "status":"ok","updated_at":datetime.now(KST).isoformat(timespec="seconds"),
            "records":records}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Loaded {len(records)} verified KRX review events from approved feed.")
    return 0

if __name__=="__main__":
    try:
        sys.exit(collect())
    except FeedError as exc:
        print("KIND feed validation failed: "+str(exc),file=sys.stderr)
        sys.exit(1)
