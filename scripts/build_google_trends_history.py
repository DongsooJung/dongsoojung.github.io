#!/usr/bin/env python3
"""실제 Google Trends 일별 스냅샷을 연구 분석용 시계열로 누적한다."""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "google-trends" / "data.json"
HISTORY = ROOT / "google-trends" / "history.json"
TREATED = "비즈니스·산업"
CONTROL = "스포츠"


def point(payload: dict, observed_on: str | None = None) -> dict:
    totals = {TREATED: 0, CONTROL: 0}
    counts = {TREATED: 0, CONTROL: 0}
    for item in payload.get("items", []):
        category = item.get("category")
        if category in totals:
            totals[category] += int(item.get("volume") or 0)
            counts[category] += 1
    stamp = observed_on or str(payload.get("updatedAt", ""))[:10] or date.today().isoformat()
    return {"date": stamp, "treatedRaw": totals[TREATED], "controlRaw": totals[CONTROL],
            "treatedCount": counts[TREATED], "controlCount": counts[CONTROL]}


def bootstrap_from_git(limit: int) -> list[dict]:
    output = subprocess.check_output(
        ["git", "log", f"--max-count={limit}", "--format=%H %cs", "--", "google-trends/data.json"],
        cwd=ROOT, text=True,
    )
    rows = []
    for line in reversed(output.splitlines()):
        commit, committed_on = line.split()
        try:
            raw = subprocess.check_output(
                ["git", "show", f"{commit}:google-trends/data.json"], cwd=ROOT, text=True
            )
            rows.append(point(json.loads(raw), committed_on))
        except (subprocess.CalledProcessError, json.JSONDecodeError):
            continue
    return rows


def normalize(rows: list[dict]) -> list[dict]:
    treated_max = max((row["treatedRaw"] for row in rows), default=1) or 1
    control_max = max((row["controlRaw"] for row in rows), default=1) or 1
    return [{**row, "treated": round(row["treatedRaw"] / treated_max * 100, 2),
             "control": round(row["controlRaw"] / control_max * 100, 2)} for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bootstrap-git", action="store_true")
    parser.add_argument("--limit", type=int, default=90)
    args = parser.parse_args()
    existing = json.loads(HISTORY.read_text(encoding="utf-8")).get("rows", []) if HISTORY.exists() else []
    rows = bootstrap_from_git(args.limit) if args.bootstrap_git else existing
    rows.append(point(json.loads(DATA.read_text(encoding="utf-8"))))
    by_date = {row["date"]: {k: v for k, v in row.items() if k not in {"treated", "control"}} for row in rows}
    raw_rows = [by_date[key] for key in sorted(by_date)][-args.limit:]
    payload = {"sourceMode": "google-trends-snapshots",
               "source": "Google Trends 급상승 검색어 일별 저장 스냅샷",
               "treatedLabel": TREATED, "controlLabel": CONTROL,
               "normalization": "각 범주 일별 검색량 합계를 관측기간 범주별 최댓값=100으로 환산",
               "updatedAt": raw_rows[-1]["date"], "rows": normalize(raw_rows)}
    HISTORY.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"실데이터 시계열 {len(raw_rows)}일 저장: {raw_rows[0]['date']} ~ {raw_rows[-1]['date']}")


if __name__ == "__main__":
    main()
