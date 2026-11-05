"""Convert official monthly stay counts and independently verify the bulletin."""
import argparse
import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile

from openpyxl import load_workbook

NS = {"hp": "http://www.hancom.co.kr/hwpml/2011/paragraph"}
METRICS = [("total", "총계", "D"), ("F-2", "거주", "AE"),
           ("F-5", "영주", "AH"), ("F-6", "결혼이민", "AI")]


def read_json(file):
    return json.loads(file.read_text(encoding="utf-8-sig"))


def write_json(file, value):
    file.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def percentage(current, previous):
    return ((Decimal(current) / Decimal(previous) - 1) * 100).quantize(
        Decimal("0.1"), rounding=ROUND_HALF_UP)


def build(input_dir, output_dir):
    receipts = read_json(input_dir / "source-receipts.json")
    files = {}
    for receipt in receipts:
        file = input_dir / receipt["file"]
        if receipt.get("status") != 200:
            raise ValueError("Official source request did not succeed")
        if hashlib.sha256(file.read_bytes()).hexdigest() != receipt["sha256"]:
            raise ValueError("Source file changed after collection")
        files[receipt["file"]] = receipt

    sheet = load_workbook(input_dir / "체류 원표_202609.xlsx", data_only=True).active
    if sheet["A1"].value != "국적(지역) 및 체류자격별 장단기체류외국인(2026. 9. 30. 기준)":
        raise ValueError("Unexpected source period or population")
    if [sheet[x + "3"].value for x in ["D", "AE", "AH", "AI"]] != [
            "총합계", "F2(거주)", "F5(영주)", "F6(결혼이민)"]:
        raise ValueError("Source columns or status definitions changed")

    groups = {}
    continents = {}
    row_count = 0
    for row in sheet.iter_rows(min_row=5, max_col=39, values_only=True):
        continent, nationality, sex, total, *counts = row
        if total is None:
            continue
        if not all(v is None or isinstance(v, int) and v >= 0 for v in [total, *counts]):
            raise ValueError("Invalid count")
        if sum(v or 0 for v in counts) != total:
            raise ValueError("Row total mismatch")
        row_count += 1
        if nationality == "총계":
            continents[continent] = [total, *counts]
            continue
        key = (continent, nationality)
        group = groups.setdefault(key, {})
        if sex in group:
            raise ValueError("Duplicate nationality and sex")
        group[sex] = [total, *counts]

    for key, group in groups.items():
        if set(group) - {"총계", "남성", "여성", "제3의성"} or "총계" not in group:
            raise ValueError(f"Unexpected sex or missing total in {key}: {set(group)}")
        for col, value in enumerate(group["총계"]):
            subtotal = sum(group[sex][col] or 0 for sex in ["남성", "여성", "제3의성"] if sex in group)
            if (value or 0) != subtotal:
                raise ValueError("Nationality sex subtotal mismatch")
    for continent, counts in continents.items():
        for col, value in enumerate(counts):
            subtotal = sum(group["총계"][col] or 0 for key, group in groups.items()
                           if key[0] == continent)
            if (value or 0) != subtotal:
                raise ValueError("Continent subtotal mismatch")
    for col in range(4, 40):
        if (sheet.cell(4, col).value or 0) != sum(v[col - 4] or 0 for v in continents.values()):
            raise ValueError("Grand total mismatch")

    with ZipFile(input_dir / "월보 원문_202609.hwpx") as archive:
        tables = []
        for name in archive.namelist():
            if not re.fullmatch(r"Contents/section\d+\.xml", name):
                continue
            root = ET.fromstring(archive.read(name))
            for table in root.findall(".//hp:tbl", NS):
                rows = [[" ".join(t.text or "" for t in cell.findall(".//hp:t", NS))
                         for cell in row.findall("hp:tc", NS)]
                        for row in table.findall("hp:tr", NS)]
                if rows and rows[0] == ["구    분", "’26년 6월", "’26년 7월",
                                       "’26년 8월", "’26년 9월", "전월 대비",
                                       "’25년 9월", "전년 대비"]:
                    tables.append(rows)
    if len(tables) != 1:
        raise ValueError("Monthly stay table is missing or ambiguous")
    table = tables[0]
    rows = []
    for code, label, col in METRICS:
        matching = [row for row in table[1:] if
                    (code == "total" and re.sub(r"\s", "", row[0]) == "총계")
                    or (code != "total" and "(" + code + ")" in row[0])]
        if len(matching) != 1:
            raise ValueError("Missing or ambiguous bulletin status row")
        raw = matching[0]
        count = sheet[col + "4"].value
        if int(raw[4].replace(",", "")) != count:
            raise ValueError("Workbook and independent bulletin disagree")
        previous_month = int(raw[3].replace(",", ""))
        previous_year = int(raw[6].replace(",", ""))
        mom = percentage(count, previous_month)
        yoy = percentage(count, previous_year)
        if mom != Decimal(raw[5].removesuffix("%")) or yoy != Decimal(raw[7].removesuffix("%")):
            raise ValueError("Published percentage does not match counts")
        rows.append({"code": code, "labelKo": label, "count": count,
                     "previousMonthCount": previous_month, "previousYearSameMonthCount": previous_year,
                     "monthOnMonthPercent": float(mom), "yearOnYearPercent": float(yoy),
                     "sourceCell": col + "4"})

    output_dir.mkdir(parents=True, exist_ok=True)
    generated = datetime.now(timezone.utc).isoformat()
    data = {"schemaVersion": 1, "dataPeriod": "2026-09", "dataAsOf": "2026-09-30",
            "unit": "persons", "scope": "전국 국적(지역)별 장단기 체류외국인 전체",
            "rows": rows}
    metadata = {"dataPeriod": "2026-09", "dataAsOf": "2026-09-30",
                "publicationDate": "2026-10-21", "collectedAt": files["체류 원표_202609.xlsx"]["receivedAt"],
                "fileGeneratedAt": generated, "checkedAt": generated,
                "sourceFileUpdatedAt": None, "sources": receipts,
                "validation": {"nationalityGroups": len(groups), "continents": len(continents),
                               "dataRowsIncludingGrandTotal": row_count + 1,
                               "sourceNumericColumns": 36, "independentBulletinRows": 4,
                               "independentBulletinNumericComparisons": 20,
                               "rowSexContinentGrandTotalsMatched": True},
                "limitations": ["월말 체류 인원이며 입국자 수·허가 건수·조사 추정치와 구분합니다.",
                                "F-5 전체와 외국국적동포 중 F-5 인원은 다른 모집단입니다.",
                                "빈칸은 합계 검산에 한해 0으로 처리했습니다.",
                                "원표의 파일 수정시각은 미확인입니다."]}
    write_json(output_dir / "체류 통계.json", data)
    write_json(output_dir / "출처 시각.json", metadata)
    with (output_dir / "체류 통계.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["data_period", "data_as_of", "code", "label_ko", "persons",
                         "previous_month_persons", "previous_year_same_month_persons",
                         "mom_percent", "yoy_percent", "publication_date", "collected_at",
                         "file_generated_at", "checked_at"])
        for row in rows:
            writer.writerow([data["dataPeriod"], data["dataAsOf"], row["code"], row["labelKo"],
                             row["count"], row["previousMonthCount"], row["previousYearSameMonthCount"],
                             row["monthOnMonthPercent"], row["yearOnYearPercent"],
                             metadata["publicationDate"], metadata["collectedAt"], generated, generated])
    print(json.dumps({"data": data, "validation": metadata["validation"]}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    build(args.input_dir, args.output_dir)
