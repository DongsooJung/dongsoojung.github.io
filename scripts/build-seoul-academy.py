"""Aggregate Seoul OA-20528's full public CSV without publishing personal rows."""
import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import importlib.util
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('incheon', ROOT/'scripts/build-incheon-academy.py')
reader = importlib.util.module_from_spec(spec); spec.loader.exec_module(reader)
SOURCE = 'https://data.seoul.go.kr/dataList/OA-20528/S/1/datasetView.do'
SOURCE_SHA = 'f6d32be76cd431b37218f6c6bca691851b507201eb6c7603a8d73bd416fc28be'
CITIES = '종로구 중구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구 은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구 서초구 강남구 송파구 강동구'.split()

def aggregate(rows):
    groups = {name:{'name':name, 'academyCount':0, 'teachingRoomCount':0, 'total':0} for name in CITIES}
    seen, loads, kinds = set(), Counter(), Counter()
    raw = duplicate = invalid_registration_dates = recovered_districts = 0
    for row in rows:
        raw += 1
        city, identity = row['행정구역명'].strip(), row['학원지정번호'].strip()
        if not city:
            match = re.match(r'^서울(?:특별시|시)?\s+(\S+구)\s+', row['도로명주소'].strip())
            if match and match[1] in groups:
                city = match[1]
                recovered_districts += 1
        kind = {'학원':'academyCount', '교습소':'teachingRoomCount'}.get(row['학원/교습소'].strip())
        if city not in groups or not identity or not kind or row['등록상태명'] != '개원':
            raise ValueError('Unexpected jurisdiction/identity/type/status; no output published')
        if identity in seen:
            # Conflicting duplicate registration IDs must be reviewed, not counted twice.
            raise ValueError('Duplicate registration ID; source review required')
        seen.add(identity)
        load = row['적재일시'].strip()
        if not re.fullmatch(r'\d{8}',load):
            raise ValueError('Unknown row loading date')
        loads[load] += 1
        if row['등록일자'] > '20261017': invalid_registration_dates += 1
        groups[city][kind] += 1;groups[city]['total'] += 1;kinds[kind] += 1
    if not all(g['total'] for g in groups.values()): raise ValueError('Incomplete 25-district coverage')
    return list(groups.values()), {**kinds,'total':len(seen)}, {
        'inputRows':raw,'uniqueFacilities':len(seen),'duplicateRows':duplicate,'unmappedRows':0,
        'rowLoadedAtRange':[min(loads),max(loads)],'rowLoadedAtCounts':dict(sorted(loads.items())),
        'futureRegistrationDateRows':invalid_registration_dates,'districtsRecoveredFromRoadAddress':recovered_districts}

def main():
    p=argparse.ArgumentParser();p.add_argument('--csv',type=Path,required=True);p.add_argument('--collected-at',required=True);args=p.parse_args()
    if hashlib.sha256(args.csv.read_bytes()).hexdigest()!=SOURCE_SHA:raise ValueError('Source hash differs; review the new original first')
    with args.csv.open(encoding='cp949',newline='') as f:districts,totals,validation=aggregate(csv.DictReader(f))
    data={'schemaVersion':1,'dataAsOf':None,'dataPeriod':None,'sourceLatestRowLoadedAt':'2026-10-11',
          'collectedAt':args.collected_at,'snapshotUpdatedAt':datetime.now(timezone.utc).isoformat(),
          'source':{'name':'서울 열린데이터광장 서울시 학원 교습소정보 OA-20528','url':SOURCE,
                    'downloadUrl':'https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do','downloadMethod':'POST',
                    'downloadForm':{'srvType':'S','infId':'OA-20528','serviceKind':'0','pageNo':'1','ssUserId':'SAMPLE_VIEW','strWhere':'','strOrderby':'PEI_DSGN_NO ASC','filterCol':'','txtFilter':''},'sha256':SOURCE_SHA},
          'definition':'전체 CSV에서 등록상태 개원인 학원·교습소를 학원지정번호 1개당 1시설로 집계. 행별 적재일은 관측일·전수 기준일이 아니며 10월 월간 통계 또는 완결 집계가 아님. 과거 수요지수·2월 경기·8월 인천과 증감 비교 불가.',
          'districts':districts,'totals':totals,'validation':validation}
    reader.json_write(ROOT/'data/academy/seoul.json',data)
    print({'totals':totals,'rows':validation['inputRows'],'loadedRange':validation['rowLoadedAtRange'],'futureRegistrationDateRows':validation['futureRegistrationDateRows']})
if __name__=='__main__':main()
