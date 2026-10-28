#!/usr/bin/env python3
"""Build a deduplicated, source-linked IPO disclosure change feed.

No external requests. Compare the freshly authenticated OpenDART snapshot with
the persistent seen ledger; the first run establishes a silent baseline.
The feed covers the LIMITED subset fetched by update-ipo-calendar.py.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "unlisted-stocks" / "data"
INPUT = ROOT / "ipo-calendar.json"
REVIEWS = ROOT / "kind-verified.json"
OUTPUT = ROOT / "ipo-alerts.json"
KST = timezone(timedelta(hours=9))
FIELDS = ("subscription_start", "subscription_end", "payment_date", "offering_price_raw")
MAX_ALERTS = 180
MAX_SEEN = 5000


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def receipt(row: dict) -> str | None:
    value = str(row.get("rcept_no", ""))
    return value if re.fullmatch(r"\d{14}", value) else None


def digest(row: dict) -> str:
    payload = [str(row.get(key) or "").strip() for key in FIELDS]
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False).encode("utf-8")).hexdigest()[:24]


def bounded_name(row: dict) -> str:
    return str(row.get("name") or "기업명 미확인")[:120]


def dart_url(value: str) -> str:
    return "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=" + value


def stage_key(row: dict) -> str:
    return "|".join([
        str(row.get("name") or ""),
        str(row.get("stage") or ""),
        str(row.get("announcement_date") or ""),
        str(row.get("source_url") or ""),
    ])


def collect(old: dict, calendar: dict, kind: dict, now: str) -> dict:
    if calendar.get("status") != "ok":
        raise ValueError("Refusing to rebuild alert feed from unverified IPO calendar")
    rows = calendar.get("records")
    if not isinstance(rows, list):
        raise ValueError("Calendar records must be a list")
    old_seen = dict(old.get("seen") or {})
    old_kind_seen = dict(old.get("review_seen") or {})
    baseline = old.get("status") != "ok"
    kind_ready = kind.get("status") == "ok" and isinstance(kind.get("records"), list)
    kind_baseline = not bool(old_kind_seen)
    new_seen = dict(old_seen)
    new_kind_seen = dict(old_kind_seen)
    events = []
    processed = set()

    for row in rows:
        if not isinstance(row, dict) or row.get("source") != "OpenDART estkRs":
            continue
        rid = receipt(row)
        if not rid or rid in processed:
            continue
        processed.add(rid)
        fingerprint = digest(row)
        previous = old_seen.get(rid)
        new_seen[rid] = {
            "fingerprint": fingerprint,
            "first_seen_at": (previous or {}).get("first_seen_at") or now,
            "last_seen_at": now,
        }
        if baseline:
            continue
        change_type = (
            "new_filing" if previous is None
            else "schedule_changed" if previous.get("fingerprint") != fingerprint
            else None
        )
        if not change_type:
            continue
        events.append({
            "id": ("dart:" + rid + ":" + fingerprint + ":" + change_type),
            "type": change_type,
            "name": bounded_name(row),
            "rcept_no": rid,
            "source": "OpenDART",
            "source_url": dart_url(rid),
            "received_at": rid[:4] + "-" + rid[4:6] + "-" + rid[6:8],
            "detected_at": now,
            "subscription_start": row.get("subscription_start"),
            "subscription_end": row.get("subscription_end"),
            "payment_date": row.get("payment_date"),
        })

    if kind_ready:
        for item in kind["records"]:
            if not isinstance(item, dict):
                continue
            key = stage_key(item)
            if not key or not str(item.get("source_url") or "").startswith("https://"):
                continue
            new_kind_seen[key] = now
            if baseline or kind_baseline or key in old_kind_seen:
                continue
            events.append({
                "id": "kind:" + hashlib.sha256(key.encode("utf-8")).hexdigest()[:24],
                "type": "review_event",
                "name": bounded_name(item),
                "stage": item.get("stage"),
                "source": "KRX KIND licensed feed",
                "source_url": item.get("source_url"),
                "received_at": item.get("announcement_date"),
                "detected_at": now,
            })

    history = [
        event for event in old.get("events", [])
        if isinstance(event, dict) and isinstance(event.get("id"), str)
    ]
    dedup = {event["id"]: event for event in history}
    for event in events:
        dedup[event["id"]] = event
    recent = sorted(dedup.values(), key=lambda event: (event.get("detected_at") or "", event["id"]), reverse=True)[:MAX_ALERTS]

    # Retain previously seen IDs even when recent snapshots omit them: the
    # upstream search is truncated and disappearing/reappearing is not a new IPO.
    new_seen = dict(sorted(new_seen.items(),
                           key=lambda pair: pair[1].get("last_seen_at", ""),
                           reverse=True)[:MAX_SEEN])
    new_kind_seen = dict(sorted(new_kind_seen.items(),
                                key=lambda pair: pair[1], reverse=True)[:MAX_SEEN])
    return {
        "schema": 1,
        "status": "ok",
        "source": "OpenDART plus optional licensed KRX KIND",
        "updated_at": now,
        "initialized_at": old.get("initialized_at") or now,
        "calendar_updated_at": calendar.get("updated_at"),
        "kind_connected": kind_ready,
        "coverage": calendar.get("coverage", {}),
        "baseline_created": baseline,
        "last_scan_new_count": len(events),
        "seen": new_seen,
        "review_seen": new_kind_seen,
        "events": recent,
        "disclaimer": "Changes in sampled filings, not a complete IPO market notification service. All event labels refer to evidence documents; no IPO approval is inferred.",
    }


def main():
    now = datetime.now(KST).isoformat(timespec="seconds")
    prior = load_json(OUTPUT)
    calendar = load_json(INPUT)
    kind = load_json(REVIEWS)
    result = collect(prior, calendar, kind, now)
    ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"IPO alerts updated: {result['last_scan_new_count']} changes; "
          f"{len(result['seen'])} receipts tracked; "
          f"initial_baseline={result['baseline_created']}")


if __name__ == "__main__":
    main()
