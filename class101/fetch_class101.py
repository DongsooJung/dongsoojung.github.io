#!/usr/bin/env python3
"""Archive CLASS101's public Korean recommendation lineup as JSON."""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE_URL = "https://class101.net/ko/pages/everything-class101"
SEOUL = timezone(timedelta(hours=9), name="Asia/Seoul")
NEXT_DATA_PATTERN = re.compile(
    r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
    re.DOTALL,
)


def fetch_source_html() -> str:
    request = Request(
        SOURCE_URL,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; StargateClass101ArchiveBot/1.0; "
                "+https://stargateedu.co.kr/class101/)"
            ),
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.5",
            "Accept-Encoding": "identity",
        },
    )
    with urlopen(request, timeout=45) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def resolve_ref(cache: dict, value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    ref = value.get("__ref")
    resolved = cache.get(ref)
    return resolved if isinstance(resolved, dict) else None


def extract_snapshot(html: str, collected_at: str) -> dict:
    match = NEXT_DATA_PATTERN.search(html)
    if not match:
        raise RuntimeError("CLASS101 페이지에서 __NEXT_DATA__를 찾지 못했습니다.")

    payload = json.loads(match.group(1))
    cache = (
        payload.get("props", {})
        .get("apolloState", {})
        .get("data", {})
    )
    if not cache:
        raise RuntimeError("CLASS101 공개 Apollo 데이터가 비어 있습니다.")

    collections = [
        value
        for value in cache.values()
        if isinstance(value, dict) and value.get("__typename") == "CollectionV2"
    ]
    if not collections:
        raise RuntimeError("CLASS101 공개 추천 섹션을 찾지 못했습니다.")

    records_by_id: dict[str, dict] = {}
    section_summaries: list[dict] = []
    placement_count = 0

    for section_order, collection in enumerate(collections, start=1):
        section_title = (collection.get("title") or "기타").strip()
        edges = (collection.get("products") or {}).get("edges") or []
        section_count = 0

        for section_rank, edge in enumerate(edges, start=1):
            product = resolve_ref(cache, (edge or {}).get("node"))
            if not product:
                continue

            product_id = product.get("_id")
            title = (product.get("title") or "").strip()
            if not product_id or not title:
                continue

            section_count += 1
            placement_count += 1
            product_id = str(product_id)
            category = resolve_ref(cache, product.get("category"))
            parent_category = resolve_ref(
                cache,
                next(
                    (
                        value
                        for key, value in (category or {}).items()
                        if key.startswith("ancestor(")
                    ),
                    None,
                ),
            )
            author = resolve_ref(cache, product.get("author"))

            if product_id not in records_by_id:
                records_by_id[product_id] = {
                    "rank": len(records_by_id) + 1,
                    "productId": product_id,
                    "klassId": product.get("klassId"),
                    "title": title,
                    "creator": (author or {}).get("displayName") or "크리에이터 정보 없음",
                    "category": (category or {}).get("title") or "미분류",
                    "parentCategory": (
                        (parent_category or {}).get("title")
                        or (category or {}).get("title")
                        or "미분류"
                    ),
                    "sections": [],
                    "sectionRanks": {},
                    "isTvodOnly": bool(product.get("isTvodOnly")),
                    "thumbnailUrl": product.get("coverImageUrl"),
                    "url": f"https://class101.net/ko/products/{product_id}",
                    "collectedAt": collected_at,
                }

            record = records_by_id[product_id]
            if section_title not in record["sections"]:
                record["sections"].append(section_title)
            record["sectionRanks"][section_title] = section_rank

        section_summaries.append(
            {
                "order": section_order,
                "title": section_title,
                "count": section_count,
            }
        )

    records = list(records_by_id.values())
    if len(records) < 10:
        raise RuntimeError(f"수집된 고유 클래스가 너무 적습니다: {len(records)}개")

    return {
        "source": SOURCE_URL,
        "scope": "CLASS101 한국어 공개 추천 랜딩 페이지",
        "collectedAt": collected_at,
        "archiveDate": collected_at[:10],
        "count": len(records),
        "placementCount": placement_count,
        "sectionCount": len(section_summaries),
        "sections": section_summaries,
        "courses": records,
    }


def write_outputs(root: Path, snapshot: dict) -> None:
    data_dir = root / "data"
    history_dir = data_dir / "history"
    history_dir.mkdir(parents=True, exist_ok=True)

    encoded = json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n"
    (data_dir / "latest.json").write_text(encoded, encoding="utf-8")
    (history_dir / f"{snapshot['archiveDate']}.json").write_text(
        encoded,
        encoding="utf-8",
    )

    archive_path = data_dir / "archives.json"
    if archive_path.exists():
        archives = json.loads(archive_path.read_text(encoding="utf-8"))
    else:
        archives = {"archives": []}

    entries = [
        entry
        for entry in archives.get("archives", [])
        if entry.get("date") != snapshot["archiveDate"]
    ]
    entries.append(
        {
            "date": snapshot["archiveDate"],
            "collectedAt": snapshot["collectedAt"],
            "count": snapshot["count"],
            "placementCount": snapshot["placementCount"],
            "json": f"./data/history/{snapshot['archiveDate']}.json",
        }
    )
    archives["archives"] = sorted(
        entries,
        key=lambda entry: entry["date"],
        reverse=True,
    )
    archive_path.write_text(
        json.dumps(archives, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input-html",
        type=Path,
        help="네트워크 대신 저장된 CLASS101 HTML을 사용합니다.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="데이터를 저장할 class101 디렉터리",
    )
    args = parser.parse_args()

    collected_at = datetime.now(SEOUL).replace(microsecond=0).isoformat()
    html = (
        args.input_html.read_text(encoding="utf-8")
        if args.input_html
        else fetch_source_html()
    )
    snapshot = extract_snapshot(html, collected_at)
    write_outputs(args.root.resolve(), snapshot)
    print(
        f"{collected_at} 기준 고유 클래스 {snapshot['count']}개, "
        f"노출 {snapshot['placementCount']}건을 저장했습니다."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"수집 실패: {error}", file=sys.stderr)
        raise
