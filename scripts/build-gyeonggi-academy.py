"""Aggregate GOE's course-level public workbooks; publish no facility records.

Reuses the Incheon XLSX reader. Facility identity is normalized type/name/full
address because the source omits registration IDs; this is a directory count,
not a registration-ID census or a count of courses, students or demand.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from zipfile import ZipFile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('incheon', ROOT/'scripts/build-incheon-academy.py')
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)
SOURCE = 'https://goe.go.kr/goe/na/ntt/selectNttInfo.do?nttSn=2377367&bbsId=2675&mi=10961'
INPUTS = {
    'academyCount': ('4bba1941-d0e1-4e9b-9d67-1ca054b3fe96.xlsx', '93deaf37a811f82faf3cd6fd1d2d06c57ae0a0e35d69c5ce114cce86a8ffd4c1'),
    'teachingRoomCount': ('e6202e94-36c2-4a87-bdd2-76688194fe2b.xlsx', '259b4c22010895c238ffc2b83ac950e15a3713aab95d9ffdc906ad1b4b1d8f95'),
}
CITIES = '수원시 용인시 고양시 성남시 화성시 부천시 남양주시 안양시 김포시 시흥시 안산시 평택시 의정부시 파주시 광명시 하남시 군포시 광주시 구리시 이천시 오산시 양주시 의왕시 안성시 양평군 여주시 과천시 포천시 동두천시 가평군 연천군'.split()

def workbook_sheets(path):
    with ZipFile(path) as archive:
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            shared = [''.join(t.text or '' for t in si.findall('.//s:t', reader.NS)) for si in strings]
        rels = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets = {r.attrib['Id']: r.attrib['Target'] for r in rels}
        book = ET.fromstring(archive.read('xl/workbook.xml'))
        for sheet in book.findall('s:sheets/s:sheet', reader.NS):
            rid = sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
            target = targets[rid]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            yield sheet.attrib['name'], reader.sheet_rows(archive, target, shared)

def aggregate(sources):
    groups = {city: {'name':city, 'academyCount':0, 'teachingRoomCount':0, 'total':0} for city in CITIES}
    seen, stats = set(), []
    corrected_rows = 0
    for kind, sheets in sources:
        for sheet, rows in sheets:
            headers = None
            row_count = duplicate = 0
            for row in rows:
                if headers is None:
                    cols = {str(v).strip():k for k,v in row.items()}
                    if ('학원명' if kind == 'academyCount' else '교습소명') in cols:
                        headers = cols
                    continue
                name = row.get(headers['학원명' if kind == 'academyCount' else '교습소명'], '').strip()
                address = row.get(headers['주소' if kind == 'academyCount' else '교습소주소'], '').strip()
                if not name and not address:
                    continue
                # Four course rows in the pinned Seongnam sheet have a stray
                # leading "5". Correct only that reviewed jurisdiction prefix.
                if kind == 'academyCount' and sheet == '성남' and address.startswith('5경기도 성남시 '):
                    address = address[1:]
                    corrected_rows += 1
                match = re.match(r'^경기도\s+(\S+[시군])\s+', address)
                if not name or not match or match[1] not in groups:
                    raise ValueError(f'Unmapped facility in {kind}/{sheet}; no output published')
                city = match[1]
                row_count += 1
                identity = (kind, reader.normalize(name), reader.normalize(address))
                if identity in seen:
                    duplicate += 1
                    continue
                seen.add(identity)
                groups[city][kind] += 1
                groups[city]['total'] += 1
            if headers is None:
                raise ValueError(f'Missing headers in {sheet}')
            stats.append({'kind':kind, 'sheet':sheet, 'courseRows':row_count, 'duplicateCourseRows':duplicate})
    totals = {k:sum(g[k] for g in groups.values()) for k in ('academyCount','teachingRoomCount','total')}
    if not all(g['total'] > 0 for g in groups.values()) or totals['total'] != len(seen):
        raise ValueError('Missing city or unreconciled totals')
    return list(groups.values()), totals, {'inputRows':sum(s['courseRows'] for s in stats), 'uniqueFacilities':len(seen), 'duplicateCourseRows':sum(s['duplicateCourseRows'] for s in stats), 'unmappedRows':0, 'correctedAddressPrefixRows':corrected_rows, 'sheets':stats}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--academy', type=Path, required=True)
    p.add_argument('--teaching', type=Path, required=True)
    p.add_argument('--collected-at', required=True, help='Actual source response time, not observation date')
    args = p.parse_args()
    files = {'academyCount':args.academy, 'teachingRoomCount':args.teaching}
    for kind, path in files.items():
        if hashlib.sha256(path.read_bytes()).hexdigest() != INPUTS[kind][1]:
            raise ValueError('Source hash differs; review the new original before publishing')
    districts, totals, validation = aggregate((kind,workbook_sheets(path)) for kind,path in files.items())
    data = {'schemaVersion':1, 'dataAsOf':'2026-09-30', 'sourcePublishedAt':'2026-10-14',
            'collectedAt':args.collected_at, 'snapshotUpdatedAt':datetime.now(timezone.utc).isoformat(),
            'source':{'name':'경기도교육청 학원 및 교습소 공개 명부', 'url':SOURCE,
                      'files':[{'kind':kind,'url':'https://www.goe.go.kr/resource/goe/na/bbs_2675/2026/10/'+v[0], 'sha256':v[1]} for kind,v in INPUTS.items()]},
            'definition':'공개 명부 내 유형·시설명·전체 주소의 공백/NFKC 정규화 후 중복 제거. 등록번호 미제공으로 동일명·주소의 별도 등록은 구분 불가. 폐원 이력·수강생·면적당 밀도·수요지수 아님. 2월 게시본과 증감 비교 불가.',
            'districts':districts, 'totals':totals, 'validation':validation}
    reader.json_write(ROOT/'data/academy/gyeonggi.json', data)
    print(json.dumps({'totals':totals, 'validation':{k:v for k,v in validation.items() if k!='sheets'}},ensure_ascii=False))

if __name__ == '__main__':
    main()
