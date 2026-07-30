#!/usr/bin/env python3
"""이전 실행 명령을 새 Node.js 매각공고 파서로 연결하는 호환 래퍼."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="대한민국법원 매각공고·상세 파싱 수집기 호환 실행기"
    )
    parser.add_argument("--month", help="조회월 YYYY-MM")
    parser.add_argument("--court", help="법원 코드 (예: B000210)")
    parser.add_argument("--latest", action="store_true", help="현재 월 조회")
    parser.add_argument("--category", help="새 수집기는 한 번에 주택·상업용을 생성합니다.")
    parser.add_argument("--sample", action="store_true", help="더 이상 지원하지 않음")
    args = parser.parse_args()

    if args.sample:
        parser.error(
            "샘플 데이터 생성은 폐기되었습니다. 실제 법원 데이터를 수집해 주세요."
        )
    if not shutil.which("npm") and not shutil.which("npm.cmd"):
        parser.error("Node.js/npm이 필요합니다.")

    base = Path(__file__).resolve().parent
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    if not (base / "node_modules").exists():
        subprocess.run(
            [npm, "install", "--no-audit", "--no-fund"],
            cwd=base,
            check=True,
        )

    command = [npm, "run", "collect", "--"]
    if args.month:
        command.append(f"--month={args.month}")
    elif args.latest:
        command.append("--month=current")
    if args.court:
        command.append(f"--court={args.court}")

    if args.category:
        print(
            f"참고: --category={args.category} 옵션과 관계없이 주택·상업용 JSON을 함께 갱신합니다."
        )
    return subprocess.run(command, cwd=base, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())
