#!/usr/bin/env python3
"""한국관광 데이터랩의 최신 공식 엑셀을 대시보드 JSON으로 변환한다."""

from __future__ import annotations

import argparse
import json
import re
import tempfile
from html.parser import HTMLParser
from http.cookiejar import CookieJar
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent
MAIN_URL = "https://datalab.visitkorea.or.kr/datalab/portal/main/getMainForm.do"
LIST_PATH = "/site/portal/ex/bbs/List.do?cbIdx=1603&tgtTypeCd=CATE_CONT&searchKey2=spt01"
COUNTRIES = {"china": "중국", "taiwan": "대만", "vietnam": "베트남"}


class Links(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self.current = [], None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.current = {**dict(attrs), "text": ""}

    def handle_data(self, data):
        if self.current is not None:
            self.current["text"] += data

    def handle_endtag(self, tag):
        if tag == "a" and self.current is not None:
            self.links.append(self.current)
            self.current = None


def parsed_links(html):
    parser = Links()
    parser.feed(html)
    return parser.links


def latest_announcement(html):
    candidates = []
    for link in parsed_links(html):
        match = re.fullmatch(r"(20\d{2})년\s*(\d{1,2})월\s*한국관광통계\s*공표", link["text"].strip())
        if match and link.get("href", "").startswith("/site/portal/ex/bbs/View.do?"):
            candidates.append((f"{int(match[1]):04d}-{int(match[2]):02d}", link["href"]))
    if not candidates:
        raise RuntimeError("공식 공표 목록에서 월별 한국관광통계를 찾지 못했습니다.")
    return max(candidates)


def announcement_workbook(html):
    for link in parsed_links(html):
        if not re.fullmatch(r"전체국가통계_\d{6}\.xlsx", link["text"].strip()):
            continue
        match = re.fullmatch(r"funDownload\('([0-9]+)',\s*'([0-9]+)',\s*'([a-f0-9-]+\.xlsx)'\)", link.get("onclick", ""))
        if match:
            query = urllib.parse.urlencode(dict(zip(("bcIdx", "cbIdx", "streFileNm"), match.groups())))
            return "https://datalab.visitkorea.or.kr/common/board/Download.do?" + query
    raise RuntimeError("공표 게시물의 전체국가통계 XLSX를 찾지 못했습니다.")


def discover_source():
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    opener.addheaders = [("User-Agent", "stargateedu-dashboard/1.0")]
    with opener.open(MAIN_URL, timeout=45) as response:
        response.read()
    # Use the same public menu navigation as the official site. Its bare list
    # URL otherwise redirects to the homepage and no longer contains releases.
    form = urllib.parse.urlencode({"userMenuUrl": LIST_PATH, "currMenu": "10504040000002021100613", "menuDepth": "3", "mainThemeCd": ""}).encode()
    with opener.open("https://datalab.visitkorea.or.kr/datalab/portal/goUrl.do", data=form, timeout=45) as response:
        listing = response.read().decode("utf-8")
    period, link = latest_announcement(listing)
    announcement = urllib.parse.urljoin(MAIN_URL, link)
    with opener.open(announcement, timeout=45) as response:
        html = response.read().decode("utf-8")
    published = re.search(r">\s*(20\d{2})\.(\d{2})\.(\d{2})\s+\d{2}:\d{2}\s*<", html)
    return {"url": announcement_workbook(html), "announcementUrl": announcement,
            "publishedAt": "-".join(published.groups()) if published else None, "dataPeriod": period}


def latest_workbook_url() -> str:
    return discover_source()["url"]


def obtain(source: str | None) -> tuple[Path, str]:
    if source and not source.startswith(("https://", "http://")):
        return Path(source), "local-official-workbook"
    url = source or latest_workbook_url()
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "datalab.visitkorea.or.kr" or parsed.username or parsed.password:
        raise ValueError("공식 한국관광 데이터랩 HTTPS 다운로드만 허용합니다.")
    req = urllib.request.Request(url, headers={"User-Agent": "stargateedu-dashboard/1.0"})
    with urllib.request.urlopen(req, timeout=90) as response, tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as target:
        content = response.read(12 * 1024 * 1024 + 1)
        if len(content) > 12 * 1024 * 1024 or not content.startswith(b"PK"):
            raise ValueError("공식 XLSX 파일 형식 또는 크기 검증 실패")
        target.write(content)
    return Path(target.name), url


def parse(path: Path, source_url: str, start_year: int) -> dict:
    workbook = load_workbook(path, read_only=True, data_only=True)
    if "입국" not in workbook.sheetnames:
        raise RuntimeError("공식 통계 파일의 '입국' 시트가 없습니다.")
    sheet = workbook["입국"]
    headers = [cell.value for cell in next(sheet.iter_rows(min_row=3, max_row=3))]
    month_cols: dict[int, str] = {}
    for column, value in enumerate(headers, start=1):
        match = re.fullmatch(r"(20\d{2})\.(\d{1,2})월", str(value or "").strip())
        if match and int(match.group(1)) >= start_year:
            month_cols[column] = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}"
    if not month_cols:
        raise RuntimeError("월별 통계 열을 찾지 못했습니다.")
    if len(set(month_cols.values())) != len(month_cols):
        raise RuntimeError("월별 통계 열이 중복되었습니다.")

    country_rows: dict[str, dict[str, int | None]] = {}
    label_to_key = {label: key for key, label in COUNTRIES.items()}
    for row in sheet.iter_rows(min_row=4, values_only=True):
        label = str(row[1] or "").strip()
        if label not in label_to_key:
            continue
        key = label_to_key[label]
        if key in country_rows:
            raise RuntimeError("국가 행이 중복되었습니다.")
        country_rows[key] = {
            ym: int(row[column - 1]) if isinstance(row[column - 1], (int, float)) else None
            for column, ym in month_cols.items()
        }
    missing = set(COUNTRIES) - set(country_rows)
    if missing:
        raise RuntimeError(f"국가 행 누락: {', '.join(sorted(missing))}")

    series = []
    for ym in sorted(month_cols.values()):
        item = {"ym": ym, **{key: country_rows[key][ym] for key in COUNTRIES}}
        if any(item[key] is not None for key in COUNTRIES):
            series.append(item)
    if not series or series[-1]["ym"] < "2024-01":
        raise RuntimeError("공식 파일의 최신 월 검증에 실패했습니다.")
    if series[-1]["ym"] >= datetime.now(timezone.utc).strftime("%Y-%m"):
        raise RuntimeError("공표되지 않은 현재·미래 월은 월간 통계로 반영하지 않습니다.")
    if any(value is not None and value < 0 for row in series for key, value in row.items() if key != "ym"):
        raise RuntimeError("관광객 수에 음수가 포함되었습니다.")

    return {
        "updatedAt": datetime.now(timezone.utc).date().isoformat(),
        "sourceMode": "official-xlsx",
        "source": "한국관광공사 한국관광 데이터랩 한국관광통계 공식 XLSX",
        "sourceUrl": source_url,
        "dataPeriod": series[-1]["ym"],
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "series": series,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", nargs="?", help="공식 XLSX 로컬 경로 또는 다운로드 URL")
    parser.add_argument("--start-year", type=int, default=2010)
    args = parser.parse_args()
    info = discover_source() if not args.source else {}
    workbook, source_url = obtain(args.source or info["url"])
    data = parse(workbook, source_url, args.start_year)
    if info:
        if data["dataPeriod"] != info["dataPeriod"]:
            raise RuntimeError("공표 제목과 엑셀의 기준월이 다릅니다.")
        data.update(sourcePublishedAt=info["publishedAt"], announcementUrl=info["announcementUrl"])
    try:
        existing = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        existing = None
    if existing and existing["series"][-1]["ym"] > data["dataPeriod"]:
        raise RuntimeError("기존 데이터보다 오래된 공표본으로 되돌릴 수 없습니다.")
    if existing and len(data["series"]) < len(existing["series"]):
        raise RuntimeError("기존 월별 통계가 누락된 파일로 덮어쓸 수 없습니다.")
    if existing and existing.get("nextPublication", {}).get("dataPeriod", "") > data["dataPeriod"]:
        data["nextPublication"] = existing["nextPublication"]
    if existing and existing["series"] == data["series"] and existing.get("sourceUrl") == data["sourceUrl"]:
        print("공식 원자료 대조 완료: 데이터 변경 없음")
        return
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    (ROOT / "data.json").write_text(encoded, encoding="utf-8")
    (ROOT / "fallback-data.js").write_text(
        "window.FALLBACK_DATA = " + json.dumps(data, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )
    print(
        f"공식 통계 {len(data['series'])}개월 변환 완료: "
        f"{data['series'][0]['ym']} ~ {data['series'][-1]['ym']}"
    )


if __name__ == "__main__":
    main()
