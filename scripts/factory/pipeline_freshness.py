#!/usr/bin/env python3
"""실가동 데이터 파이프라인 신선도 점검 → factory/data/freshness.json

판정 근거는 세 가지이며, 있는 것만 씁니다. 값을 추정해 채우지 않습니다.
  1) 데이터 파일 안의 갱신 시각 (updatedAt · generated_at · collectedAt …)
  2) 그 파일을 마지막으로 커밋한 시각 (git log)
  3) 워크플로 최근 실행 결과 (GitHub API, GITHUB_TOKEN 이 있을 때만)

주기(cadence)는 workflow 파일의 cron 에서 '연속 실행 간 최대 간격'으로 계산합니다.
평일만 도는 잡은 금→월 72시간이 주기가 되므로 주말에 거짓 경보가 나지 않습니다.
판정: 경과시간 > 주기 × 1.5 → stale
"""
import json, os, re, subprocess, sys, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from croniter import croniter

ROOT = Path(__file__).resolve().parents[2]
REG = ROOT / "factory" / "data" / "pipelines.json"
OUT = ROOT / "factory" / "data" / "freshness.json"
WF = ROOT / ".github" / "workflows"
KST = timezone(timedelta(hours=9))
UTC = timezone.utc
REPO = os.environ.get("GITHUB_REPOSITORY", "DongsooJung/dongsoojung.github.io")
TOKEN = os.environ.get("GITHUB_TOKEN")

TS_KEYS = ("updated_at", "updatedAt", "generated_at", "generatedAt", "collectedAt",
           "collected_at", "fetchedAt", "fetched_at", "checked_at_kst", "checkedAt",
           "last_updated", "lastUpdated", "timestamp")
NEST = ("meta", "_meta", "metadata", "info")
MIN_CADENCE_H = 3          # Actions 스케줄 지연 허용
TOLERANCE = 1.5


def now():
    return datetime.now(UTC)


def parse_ts(v):
    if v is None:
        return None
    s = str(v).strip()
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):            # 날짜만 있으면 KST 자정으로 (보수적)
            return datetime.fromisoformat(s).replace(tzinfo=KST)
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=KST)
    except ValueError:
        return None


def find_ts(node, depth=0):
    if depth > 2 or not isinstance(node, dict):
        return None, None
    for k in TS_KEYS:
        if node.get(k):
            t = parse_ts(node[k])
            if t:
                return k, t
    for n in NEST:
        k, t = find_ts(node.get(n), depth + 1)
        if t:
            return f"{n}.{k}", t
    return None, None


def is_demo(node):
    if not isinstance(node, dict):
        return False
    for n in (node, node.get("meta") or {}):
        if str(n.get("mode", "")).lower() in ("demo", "sample", "mock"):
            return True
        if n.get("is_demo") is True or n.get("demo") is True:
            return True
    return False


def crons_of(workflow):
    p = WF / workflow
    if not p.exists():
        return []
    return re.findall(r"cron:\s*['\"]([^'\"]+)['\"]", p.read_text(encoding="utf-8"))


def cadence_hours(crons):
    """다음 14일 동안 모든 cron 의 실행 시각을 합쳐 최대 간격을 구합니다."""
    if not crons:
        return None
    start = now()
    end = start + timedelta(days=14)
    fires = []
    for c in crons:
        it = croniter(c, start)
        while True:
            t = it.get_next(datetime)
            if t > end:
                break
            fires.append(t)
            if len(fires) > 5000:
                break
    fires.sort()
    if len(fires) < 2:
        return 24 * 31                                     # 월 1회 잡
    gap = max((b - a).total_seconds() for a, b in zip(fires, fires[1:])) / 3600
    return max(MIN_CADENCE_H, round(gap, 1))


def last_commit(path):
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cI|%an", "--", path],
                             cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.strip()
        if not out:
            return None, None
        ts, who = out.split("|", 1)
        return parse_ts(ts), who
    except Exception:
        return None, None


def observed_cadence(path):
    """최근 45일 커밋 간격의 75백분위. 변경이 있을 때만 커밋하는 잡이나
    GitHub 스케줄 지연으로 cron 보다 드물게 쓰이는 잡의 실제 주기를 반영합니다."""
    try:
        out = subprocess.run(["git", "log", "--since=45.days", "-30", "--format=%cI", "--", path],
                             cwd=ROOT, capture_output=True, text=True, timeout=20).stdout.split()
    except Exception:
        return None
    ts = sorted(t for t in (parse_ts(x) for x in out) if t)
    if len(ts) < 4:
        return None
    gaps = sorted((b - a).total_seconds() / 3600 for a, b in zip(ts, ts[1:]))
    return round(gaps[int(len(gaps) * 0.75) - (1 if len(gaps) % 4 == 0 else 0)], 1)


def last_run(workflow):
    if not TOKEN:
        return None
    url = f"https://api.github.com/repos/{REPO}/actions/workflows/{workflow}/runs?per_page=1&exclude_pull_requests=true"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {TOKEN}",
                                               "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            runs = json.load(r).get("workflow_runs") or []
    except Exception:
        return None
    if not runs:
        return None
    r = runs[0]
    return {"status": r.get("status"), "conclusion": r.get("conclusion"),
            "at": r.get("run_started_at") or r.get("created_at"), "url": r.get("html_url")}


def iso(dt):
    return dt.astimezone(KST).isoformat(timespec="seconds") if dt else None


def check(p):
    crons = crons_of(p["workflow"])
    cron_cad = cadence_hours(crons)
    obs_cad = observed_cadence(p["data"]) if p.get("data") else None
    cad, cad_src = cron_cad, "cron"
    if obs_cad and cron_cad and obs_cad > cron_cad:
        cad, cad_src = obs_cad, "observed"
    row = {**p, "crons": crons, "cadence_hours": cad, "cadence_source": cad_src,
           "cron_cadence_hours": cron_cad, "flags": []}

    data_ts = key = None
    demo = False
    if p.get("data"):
        f = ROOT / p["data"]
        if f.exists():
            try:
                body = json.loads(f.read_text(encoding="utf-8"))
                node = body[0] if isinstance(body, list) and body else body
                key, data_ts = find_ts(node)
                demo = is_demo(node)
            except Exception as e:
                row["flags"].append(f"parse_error:{type(e).__name__}")
        else:
            row["flags"].append("data_missing")
    commit_ts, commit_by = last_commit(p["data"]) if p.get("data") else (None, None)
    run = last_run(p["workflow"])

    ref = data_ts or commit_ts
    age_h = round((now() - ref).total_seconds() / 3600, 1) if ref else None

    if run and run.get("conclusion") == "failure":
        state = "fail"
    elif not crons:
        state = "unscheduled"
    elif ref is None:
        state = "unmeasured"
    elif cad and age_h > cad * TOLERANCE:
        state = "stale"
    else:
        state = "ok"
    if demo:
        row["flags"].append("demo")
    if commit_by and "bot" not in commit_by.lower():
        row["flags"].append("last_write_by_human")

    row.update({
        "state": state,
        "data_key": key,
        "data_updated_at": iso(data_ts),
        "last_commit_at": iso(commit_ts),
        "last_commit_by": commit_by,
        "age_hours": age_h,
        "last_run": run,
    })
    return row


def main():
    reg = json.loads(REG.read_text(encoding="utf-8"))
    rows = [check(p) for p in reg["pipelines"]]
    summary = {s: sum(1 for r in rows if r["state"] == s)
               for s in ("ok", "stale", "fail", "unmeasured", "unscheduled")}
    summary["demo"] = sum(1 for r in rows if "demo" in r["flags"])
    summary["total"] = len(rows)
    out = {
        "generated_at": iso(now()),
        "rule": f"경과시간 > 주기 × {TOLERANCE} → stale · 주기 = max(cron 최대 간격, 최근 45일 커밋 간격 p75) · 최소 {MIN_CADENCE_H}h",
        "run_status_source": "github_api" if TOKEN else "unavailable",
        "lines": reg.get("lines", {}),
        "summary": summary,
        "pipelines": rows,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    for r in rows:
        if r["state"] != "ok" or r["flags"]:
            print(f"  {r['state']:11} {r['id']:18} age={r['age_hours']}h cadence={r['cadence_hours']}h flags={r['flags']}")


if __name__ == "__main__":
    sys.exit(main())
