"""Reproduce public aggregate counts from ICE's published workbook (stdlib only).

The workbook repeats a facility for every course. Publish aggregates only; never
publish its proprietor names, phone numbers, or facility-level source records.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import unicodedata
import urllib.request
from zipfile import ZipFile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PERIOD = "2026-08-01"
SOURCE_URL = "https://www.ice.go.kr/ice/na/ntt/selectNttInfo.do?nttSn=3381948"
DOWNLOAD_URL = "https://www.ice.go.kr/upload/ice/na/bbs_826/2026/08/766dd31cb1c4424eb95274aa2190fcfb.xlsx"
SOURCE_SHA = "6b1fcc5bb6067ef301c3adad20363d37864748475e9af20b504ca2e465427573"
BOUNDARY_URL = "https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@9da257a50b5757eb87ee892eb5a8e268cea1103e/kostat/2013/json/skorea_municipalities_geo_simple.json"
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
GROUPS = [
    ("ic-jy", "제물포·영종 권역", ["제물포구", "영종구"], ["중구", "동구", "제물포구", "영종구"], ["23010", "23020"]),
    ("ic-mh", "미추홀구", ["미추홀구"], ["미추홀구", "남구"], ["23030"]),
    ("ic-ys", "연수구", ["연수구"], ["연수구"], ["23040"]),
    ("ic-nd", "남동구", ["남동구"], ["남동구"], ["23050"]),
    ("ic-bp", "부평구", ["부평구"], ["부평구"], ["23060"]),
    ("ic-gy", "계양구", ["계양구"], ["계양구"], ["23070"]),
    ("ic-sg", "서해·검단 권역", ["서해구", "검단구"], ["서구", "서해구", "검단구"], ["23080"]),
    ("ic-gh", "강화군", ["강화군"], ["강화군"], ["23310"]),
    ("ic-oj", "옹진군", ["옹진군"], ["옹진군"], ["23320"]),
]
LOOKUP = {alias: code for code, _, _, aliases, _ in GROUPS for alias in aliases}


def normalize(value):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", str(value or "")))


def sheet_rows(archive, target, shared):
    with archive.open(target) as stream:
        for _, row in ET.iterparse(stream, events=("end",)):
            if row.tag != "{" + NS["s"] + "}row":
                continue
            values = {}
            for cell in row.findall("s:c", NS):
                column = re.sub(r"\d", "", cell.attrib["r"])
                value = cell.find("s:v", NS)
                text = value.text if value is not None else ""
                if cell.attrib.get("t") == "s":
                    text = shared[int(text)]
                elif cell.attrib.get("t") == "inlineStr":
                    text = "".join(cell.itertext())
                values[column] = text or ""
            yield values
            row.clear()


def aggregate(sheets):
    groups = {code: {"code": code, "name": name, "members": members,
                     "academyCount": 0, "teachingRoomCount": 0, "total": 0}
              for code, name, members, _, _ in GROUPS}
    seen = set()
    raw_rows = 0
    sheet_stats = []
    legacy_rows = 0
    for sheet_name, rows in sheets:
        rows = iter(rows)
        headers = {str(v).strip(): key for key, v in next(rows).items()}
        kind = "academyCount" if "학원명" in headers else "teachingRoomCount"
        name_col = headers.get("학원명" if kind == "academyCount" else "교습소명")
        addr_col = headers.get("학원주소" if kind == "academyCount" else "교습소주소")
        if not name_col or not addr_col:
            raise ValueError("Unexpected workbook headers; no output was published")
        sheet_count = 0
        for row in rows:
            name, address = row.get(name_col, ""), row.get(addr_col, "")
            if not name and not address:
                continue
            if not name or not address:
                raise ValueError("Incomplete facility identity; no output was published")
            match = re.fullmatch(r"인천(?:광역시|시)?\s+(\S+[구군])\s+(.+)", str(address).strip())
            if not match or match[1] not in LOOKUP:
                raise ValueError("Unmapped Incheon address; no output was published")
            code = LOOKUP[match[1]]
            raw_rows += 1
            sheet_count += 1
            if match[1] in {"중구", "동구", "서구", "남구"}:
                legacy_rows += 1
            # Keep address text except whitespace and province/district aliases.
            identity = (kind, code, normalize(name), normalize(match[2]))
            if identity in seen:
                continue
            seen.add(identity)
            groups[code][kind] += 1
            groups[code]["total"] += 1
        sheet_stats.append({"sheet": sheet_name.strip(), "courseRows": sheet_count})
    totals = {key: sum(group[key] for group in groups.values())
              for key in ("academyCount", "teachingRoomCount", "total")}
    if totals["total"] != len(seen) or not raw_rows:
        raise ValueError("Aggregate reconciliation failed")
    return list(groups.values()), totals, {
        "inputRows": raw_rows, "uniqueFacilities": len(seen),
        "duplicateCourseRows": raw_rows - len(seen), "unmappedRows": 0,
        "legacyAddressCourseRows": legacy_rows,
        "sheetCount": len(sheet_stats), "sheets": sheet_stats,
    }


def read_workbook(path):
    with ZipFile(path) as archive:
        strings = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        shared = ["".join(t.text or "" for t in si.findall(".//s:t", NS)) for si in strings]
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {r.attrib["Id"]: r.attrib["Target"] for r in relationships}
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        def sheets():
            for sheet in workbook.findall("s:sheets/s:sheet", NS):
                rid = sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
                target = targets[rid]
                target = target.lstrip("/") if target.startswith("/") else "xl/" + target
                yield sheet.attrib["name"], sheet_rows(archive, target, shared)
        return aggregate(sheets())


def json_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def summary_html(data, full_table=False):
    t = data["totals"]
    result = (f'<p class="incheon-summary">인천 <strong>{t["total"]:,}개</strong> '
              f'(학원 {t["academyCount"]:,} · 교습소 {t["teachingRoomCount"]:,}) · '
              f'<time datetime="{PERIOD}">{PERIOD}</time> 원본 기준</p>'
              '<p class="data-note">교육청 공개 명부의 명칭·주소 중복 제거 집계입니다. '
              '행정구역 개편 전·후 주소 혼재로 제물포·영종, 서해·검단을 각각 묶은 '
              '9개 비교권역을 사용합니다. 현행 11개 군·구별 수치나 면적당 밀도는 아닙니다.</p>')
    if full_table:
        result += '<div class="table-scroll"><table><caption>인천 권역별 시설 수 — 2026-08-01</caption><thead><tr><th scope="col">비교권역</th><th scope="col">학원</th><th scope="col">교습소</th><th scope="col">합계</th></tr></thead><tbody>'
        for group in data["districts"]:
            result += f'<tr><th scope="row">{html.escape(group["name"])}</th><td>{group["academyCount"]:,}</td><td>{group["teachingRoomCount"]:,}</td><td>{group["total"]:,}</td></tr>'
        result += f'<tr><th scope="row">인천 합계</th><td>{t["academyCount"]:,}</td><td>{t["teachingRoomCount"]:,}</td><td>{t["total"]:,}</td></tr></tbody></table></div>'
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True, help="Downloaded official XLSX; never commit raw records")
    args = parser.parse_args()
    digest = hashlib.sha256(args.input.read_bytes()).hexdigest()
    if digest != SOURCE_SHA:
        raise ValueError("Source workbook changed; verify its publication and period before updating SHA")
    groups, totals, validation = read_workbook(args.input)
    if validation["sheetCount"] != 10 or validation["inputRows"] != 74061:
        raise ValueError("Published workbook coverage changed")
    data = {
        "schemaVersion": 1, "province": "인천", "period": PERIOD,
        "source": {"name": "인천광역시교육청 학원 및 교습소 현황", "url": SOURCE_URL,
                   "downloadUrl": DOWNLOAD_URL, "publishedAt": "2026-08-24", "sha256": digest},
        "definition": "학원/교습소 구분 + 비교권역 + 명칭 + 주소(구명·공백 정규화)별 고유 시설 수. 강좌 중복 제거. 등록번호·운영상태 열이 없어 등록기관 수 및 현재 영업 여부와 차이 가능.",
        "districts": groups, "totals": totals, "validation": validation,
        "boundary": {"version": "2013", "path": "/geo/incheon-education-areas-2013.geojson",
                     "source": BOUNDARY_URL, "kind": "historical_illustrative_analysis_areas",
                     "note": "2013 통계청 경계를 참고 배경으로 사용. 매립·경계 변경 미반영이며 현행 행정경계가 아님. 제물포·영종 및 서해·검단을 공동 비교권역으로 표시."},
        "portalNote": "인천데이터포털 검색의 지역 한정 자료를 전역 수치로 합산하지 않고, 인증키가 필요 없는 교육청 전역 공개 원본으로 보완했습니다.",
    }
    with urllib.request.urlopen(BOUNDARY_URL, timeout=30) as response:
        geo = json.load(response)
    geometry_groups = {old_code: code for code, _, _, _, old_codes in GROUPS for old_code in old_codes}
    features = []
    for feature in geo["features"]:
        code = str(feature["properties"]["code"])
        if code in geometry_groups:
            features.append({"type": "Feature", "properties": {"code": geometry_groups[code], "originalCode": code}, "geometry": feature["geometry"]})
    if len(features) != 10 or set(f["properties"]["code"] for f in features) != set(g["code"] for g in groups):
        raise ValueError("Boundary coverage mismatch")
    # Validate every source and calculation before writing public aggregate output.
    json_write(ROOT / "data/academy/incheon.json", data)
    json_write(ROOT / "geo/incheon-education-areas-2013.geojson", {"type": "FeatureCollection", "features": features})
    for filename in ["incheon-academy-map/index.html", "sudogwon-academy-map/index.html", "research/urban-atlas/index.html"]:
        path = ROOT / filename
        if not path.exists():
            continue
        original = path.read_text(encoding="utf-8")
        marker = r"<!-- INCHEON_SUMMARY_START -->.*?<!-- INCHEON_SUMMARY_END -->"
        replacement = "<!-- INCHEON_SUMMARY_START -->" + summary_html(data, filename.startswith("incheon-academy-map")) + "<!-- INCHEON_SUMMARY_END -->"
        updated, count = re.subn(marker, lambda _: replacement, original, flags=re.S)
        if count != 1:
            raise ValueError(f"Expected one prerender marker: {filename}")
        path.write_text(updated, encoding="utf-8")
    print(json.dumps({"totals": totals, "validation": validation}, ensure_ascii=False))


if __name__ == "__main__":
    main()
