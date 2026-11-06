#!/usr/bin/env python3
"""실제 Google Trends 일별 스냅샷을 연구 분석용 시계열로 누적한다."""

from __future__ import annotations

import argparse
import csv
import json
import hashlib
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "google-trends" / "data.json"
HISTORY = ROOT / "google-trends" / "history.json"
TREATED = "비즈니스 및 금융"
CONTROL = "스포츠"
VERSION = "20261106-category-id-v2"


def point(payload: dict, *, source_commit=None, committed_at=None, source_sha256=None) -> dict:
    if payload.get("sourceMode") != "api" or not isinstance(payload.get("items"),list) or not payload["items"] or payload.get("errors"):
        raise ValueError("정상 API 변환 저장본과 비어 있지 않은 items가 필요합니다.")
    stamp = payload.get("updatedAt")
    instant = datetime.fromisoformat(stamp.replace("Z", "+00:00")) if isinstance(stamp, str) else None
    if instant is None or instant.tzinfo is None:
        raise ValueError("시간대가 있는 실제 수집기 완료시각이 필요합니다.")
    if payload.get("geo") != ["KR"] or payload.get("hours") != 48 or payload.get("limit") != 100:
        raise ValueError("KR·48시간·상위100 범위만 같은 계열에 누적합니다.")
    totals, counts, titles = {3:0,17:0}, {3:0,17:0}, set()
    for item in payload["items"]:
        title = str(item.get("title", "")).strip().casefold()
        if not title or title in titles:
            raise ValueError("검색어 식별자 누락 또는 중복입니다.")
        titles.add(title)
        if "categories" not in item or not isinstance(item["categories"], list):
            raise ValueError("범주 ID 누락: 명칭으로 대체하거나 0으로 채우지 않습니다.")
        if any(isinstance(code,bool) or not isinstance(code,int) for code in item['categories']):
            raise ValueError("범주 ID는 정수여야 합니다.")
        volume = item.get("volume")
        if isinstance(volume, bool) or not isinstance(volume, int) or volume < 0:
            raise ValueError("유효한 비음수 정수 표시 검색량이 필요합니다.")
        primary = item["categories"][0] if item["categories"] else None
        if primary in totals:
            totals[primary] += volume
            counts[primary] += 1
    return {"date":instant.astimezone(ZoneInfo("Asia/Seoul")).date().isoformat(),
            "treatedRaw":totals[3],"controlRaw":totals[17],"treatedCount":counts[3],"controlCount":counts[17],
            "collectorCompletedAt":stamp,"committedAt":committed_at,"sourceCommit":source_commit,
            "sourceSha256":source_sha256,"snapshotItemCount":len(payload["items"]),
            "sourceDocumentSha256":hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(",", ":")).encode()).hexdigest(),
            "hours":48,"geo":["KR"],"limit":100,"aggregationVersion":VERSION,
            "verification":"parsed-snapshot-derived-original-response-unavailable"}


def bootstrap_from_git(limit: int, repository: Path = ROOT, ref: str = "HEAD") -> tuple[list[dict],list[dict]]:
    output = subprocess.check_output(
        ["git", "log", ref, f"--max-count={limit*4}", "--format=%H %cI", "--", "google-trends/data.json"],
        cwd=repository, encoding="utf-8",
    )
    rows, skipped = [], []
    for line in reversed(output.splitlines()):
        commit, committed_at = line.split()
        try:
            raw = subprocess.check_output(
                ["git", "show", f"{commit}:google-trends/data.json"], cwd=repository
            )
            rows.append(point(json.loads(raw),source_commit=commit,committed_at=committed_at,
                              source_sha256=hashlib.sha256(raw).hexdigest()))
        except (subprocess.CalledProcessError, ValueError, KeyError, TypeError) as exc:
            skipped.append({"commit":commit,"reason":str(exc)})
    return rows, skipped


def normalize(rows: list[dict]) -> list[dict]:
    treated_max = max((row["treatedRaw"] for row in rows), default=1) or 1
    control_max = max((row["controlRaw"] for row in rows), default=1) or 1
    return [{**row, "treated": round(row["treatedRaw"] / treated_max * 100, 2),
             "control": round(row["controlRaw"] / control_max * 100, 2)} for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bootstrap-git", action="store_true")
    parser.add_argument("--limit", type=int, default=90)
    parser.add_argument("--repository", type=Path, default=ROOT)
    parser.add_argument("--ref", default="HEAD")
    args = parser.parse_args()
    existing = json.loads(HISTORY.read_text(encoding="utf-8")).get("rows", []) if HISTORY.exists() else []
    if args.bootstrap_git:
        rows, skipped = bootstrap_from_git(args.limit,args.repository,args.ref)
    else:
        if any(row.get("aggregationVersion") != VERSION for row in existing):
            raise ValueError("구버전과 혼합하지 않습니다. --bootstrap-git로 저장본을 먼저 재대조하세요.")
        rows, skipped = existing, []
    raw = DATA.read_bytes()
    data = json.loads(raw)
    if data.get('geo') != ['KR'] or data.get('hours') != 48 or data.get('limit') != 100:
        print('DID KR·48시간·최대100 범위 밖의 수집은 기존 시계열/CSV를 유지합니다.')
        return
    current = point(data,source_sha256=hashlib.sha256(raw).hexdigest())
    if not any(row.get("sourceDocumentSha256")==current["sourceDocumentSha256"] for row in rows): rows.append(current)
    by_date = {}
    for row in rows:
        old = by_date.get(row["date"])
        if old is None or datetime.fromisoformat(row["collectorCompletedAt"].replace("Z","+00:00")) >= datetime.fromisoformat(old["collectorCompletedAt"].replace("Z","+00:00")):
            by_date[row["date"]] = {k:v for k,v in row.items() if k not in {"treated","control"}}
    raw_rows = [by_date[key] for key in sorted(by_date)][-args.limit:]
    payload = {"sourceMode": "google-trends-snapshots",
               "source": "Google Trends 급상승 상위100 변환 저장본",
               "treatedLabel": TREATED, "controlLabel": CONTROL,
               "normalization": "보관 창의 첫 범주 ID별 구간화 표시 검색량 합을 각각 최대=100으로 환산",
               "dateMeaning": "수집기 완료시각의 KST 날짜; 48시간창은 서로 겹치며 일별 전체 검색량이 아님",
               "categoryIds":{"treated":3,"control":17},"aggregationVersion":VERSION,
               "generatedAt":datetime.now(timezone.utc).isoformat(),"sourceVerification":"parsed-snapshots-only",
               "skippedSnapshots":skipped,"normalizationWindow":{"first":raw_rows[0]["date"],"last":raw_rows[-1]["date"],"observations":len(raw_rows),"limit":args.limit},
               "updatedAt": raw_rows[-1]["date"], "rows": normalize(raw_rows)}
    HISTORY.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    csv_path = ROOT / "did/data/검색 범주 시계열.csv"
    csv_path.parent.mkdir(parents=True,exist_ok=True)
    fields = ["date","collectorCompletedAt","snapshotItemCount","hours","limit","treatedRaw","controlRaw","treatedCount","controlCount","treated","control","sourceCommit","sourceSha256"]
    with csv_path.open("w",encoding="utf-8-sig",newline="") as stream:
        writer=csv.DictWriter(stream,fieldnames=fields,extrasaction="ignore");writer.writeheader();writer.writerows(payload["rows"])
    print(f"실데이터 시계열 {len(raw_rows)}일 저장: {raw_rows[0]['date']} ~ {raw_rows[-1]['date']}")


if __name__ == "__main__":
    main()
