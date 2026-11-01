"""공식 전국 분기 PDF와 수집 영수증으로 기존 대시보드·CSV를 갱신합니다."""
import argparse
import calendar
import csv
import hashlib
import io
import json
import pathlib
import re
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pypdf import PdfReader

HEADERS = ['대분류', '죄종', '발생건수', '검거건수', '발생대비 검거율(%)', '검거인원', '법인체']
ROW = re.compile(r'^(.*?)\s+(\d[\d,]*)\s+(\d[\d,]*)\s+(\d+\.\d)\s*%?\s+(\d[\d,]*)\s+(\d[\d,]*)\s*$')

def normalize(value):
    return re.sub(r'\s+', '', value)

def document_timestamp(raw):
    match = re.fullmatch(r"D:(\d{14})(?:([+-])(\d{2})'?(\d{2})'?)?", raw or '')
    if not match:
        return '원문 표기 ' + str(raw)
    date = datetime.strptime(match[1], '%Y%m%d%H%M%S').isoformat(sep=' ')
    return date + (f' {match[2]}{match[3]}:{match[4]}' if match[2] else ' (시간대 미표기)')

def parse_rows(text, template, quarter):
    expected_title = f'{quarter[:4]}년{quarter[-1]}분기범죄발생및검거현황'
    if expected_title not in normalize(text):
        raise ValueError('원PDF 분기 제목 불일치: ' + quarter)
    matches = [m for line in text.splitlines() if (m := ROW.match(line))]
    if len(matches) != len(template):
        raise ValueError(f'원표 행 수 불일치: {quarter}:{len(matches)}')
    result = []
    for m, reference in zip(matches, template):
        category, offense = reference[:2]
        if not normalize(m[1]).endswith(normalize(offense)):
            raise ValueError(f'죄종 행 정렬 불일치: {quarter}:{offense}:{m[1]}')
        result.append([category, offense, int(m[2].replace(',', '')), int(m[3].replace(',', '')), float(m[4]), int(m[5].replace(',', '')), int(m[6].replace(',', ''))])
    validate_rows(result)
    return result

def is_major(row):
    return row[0] != '총계' and (row[1] == '소계' or row[0] == row[1])

def validate_rows(rows):
    if len({tuple(r[:2]) for r in rows}) != len(rows):
        raise ValueError('죄종 중복')
    if rows[0][:2] != ['총계', '총계']:
        raise ValueError('총계 행 누락')
    for row in rows:
        if any(row[k] < 0 for k in (2, 3, 4, 5, 6)):
            raise ValueError('음수 원표')
        if not row[2]:
            raise ValueError('발생건수 0의 비율은 별도 검토 필요')
        ratio = (Decimal(row[3]) * 100 / Decimal(row[2])).quantize(Decimal('.1'), rounding=ROUND_HALF_UP)
        if ratio != Decimal(str(row[4])):
            raise ValueError('검거 비율 불일치: ' + str(row[:2]))
    majors = [r for r in rows if is_major(r)]
    for col in (2, 3, 5, 6):
        if sum(r[col] for r in majors) != rows[0][col]:
            raise ValueError('대분류 총합 불일치')
    for subtotal in (r for r in rows if r[1] == '소계'):
        children = [r for r in rows if r[0] == subtotal[0] and r[1] != '소계']
        for col in (2, 3, 5, 6):
            if sum(r[col] for r in children) != subtotal[col]:
                raise ValueError('세부 죄종 소계 불일치')

def csv_bytes(rows):
    out = io.StringIO(newline='')
    writer = csv.writer(out, lineterminator='\n')
    writer.writerows(rows)
    return out.getvalue().encode('utf-8-sig')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input-dir', type=pathlib.Path, required=True)
    args = ap.parse_args()
    root = pathlib.Path(__file__).resolve().parents[1]
    page = root / 'research/crime-statistics/index.html'
    folder = page.parent / 'data'
    html = page.read_text(encoding='utf8')
    original = json.loads(re.search(r'const DATA=(.*?);\s*const QS=', html, re.S)[1])
    template = original['2026Q2']
    receipts = json.loads((args.input_dir / 'source-receipts.json').read_text(encoding='utf8'))
    expected = ['2025Q3', '2025Q4', '2026Q1', '2026Q2', '2026Q3']
    if [r['quarter'] for r in receipts] != expected:
        raise ValueError('공식 원표 5개 분기 필요')
    records, sources, changes = {}, [], []
    for rec in receipts:
        q = rec['quarter']
        data = (args.input_dir / rec['file']).read_bytes()
        if hashlib.sha256(data).hexdigest() != rec['sha256']:
            raise ValueError('원PDF 해시 불일치')
        reader = PdfReader(io.BytesIO(data))
        if len(reader.pages) != 1:
            raise ValueError('예상하지 않은 PDF 페이지 수')
        text = reader.pages[0].extract_text(extraction_mode='layout')
        rows = parse_rows(text, template, q)
        records[q] = rows
        sources.append({**rec, 'pdfCreationDateRaw': reader.metadata.get('/CreationDate'), 'pdfModificationDateRaw': reader.metadata.get('/ModDate'), 'scope': '경찰청 외 18개 시·도청 전국 · 분기 잠정통계', 'rows': len(rows), 'numericCells': len(rows)*5})
        if q in original:
            for before, after in zip(original[q], rows):
                for col in range(2, 7):
                    if before[col] != after[col]:
                        changes.append({'quarter':q, 'category':after[0], 'offense':after[1], 'field':HEADERS[col], 'previous':before[col], 'sourceValue':after[col]})
    display = expected[-4:]
    latest, prior = records[display[-1]], records[display[-2]]
    built_at = datetime.now(timezone.utc).isoformat()
    end_month = int(display[-1][-1])*3
    end_date = f'{display[-1][:4]}-{end_month:02d}-{calendar.monthrange(int(display[-1][:4]),end_month)[1]}'
    meta = {'schemaVersion':1, 'latestQuarter':display[-1], 'displayQuarters':display, 'archivedQuarters':expected[:-4], 'dataPeriod':'2026Q3', 'dataAsOf':end_date, 'periodStart':'2026-07-01', 'periodEnd':end_date, 'publicationDate':None, 'publicationDateNote':'공식 페이지에 분기 공표가 확인됨. 실제 게시일은 미확인;PDF 생성일을 공표일로 대신하지 않음.', 'collectedAt':receipts[-1]['receivedAt'], 'fileGeneratedAt':built_at, 'checkedAt':built_at, 'provisional':True, 'sources':sources, 'priorPublishedCellChanges':changes, 'validation':{'quarters':5,'rows':215,'numericCells':1075,'displayRows':172,'totalsSubtotalsAndRatios':'passed'}, 'metricDefinition':{'counts':'발생·검거 통계원표 건수','persons':'피의자통계원표 인원','rate':'검거건수/발생건수×100, 개별 사건의 추적 검거확률이 아님','corporations':'법인체 별도 열;검거인원과 합산하지 않음'}, 'limitations':['분기 잠정통계로 산출 시점에 따라 수정·삭제될 수 있음.','7~9월 전체 분기이며9월 단월 또는10월 통계가 아님.','지역별 전수 분해·개별 사건의 검거 확률·범죄 원인 분석은 수행하지 않음.']}
    outputs = {folder/'분기 통계.json':json.dumps({'columns':HEADERS,'quarters':expected,'displayQuarters':display,'records':records},ensure_ascii=False,indent=2).encode()+b'\n', folder/'출처 시각.json':json.dumps(meta,ensure_ascii=False,indent=2).encode()+b'\n'}
    for q, rows in records.items():
        target = folder / ('crime_'+q.lower()+'.csv')
        # Preserve already matching historical exports, including their original bytes.
        if q not in original or rows != original[q]:
            outputs[target] = csv_bytes([HEADERS,*rows])
    outputs[folder/'crime_4q.csv'] = csv_bytes([['분기',*HEADERS],*[[q,*row] for q in display for row in records[q]]])
    html = re.sub(r'const DATA=.*?;\s*const QS=.*?;', 'const DATA='+json.dumps(records,ensure_ascii=False,separators=(',',':'))+';\n    const QS='+json.dumps(display,separators=(',',':'))+';', html, flags=re.S)
    labels = {q:q[:4]+'년 '+q[-1]+'분기' for q in expected}
    html = re.sub(r'const QL=.*?;', 'const QL='+json.dumps(labels,ensure_ascii=False,separators=(',',':'))+';',html)
    html = re.sub(r'const QF=.*?;', 'const QF='+json.dumps({q:'crime_'+q.lower()+'.csv' for q in expected},separators=(',',':'))+';',html)
    html = html.replace('2025년 3분기~2026년 2분기','2025년 4분기~2026년 3분기').replace('let Q="2026Q2"','let Q="2026Q3"').replace('DATA["2026Q2"].filter','DATA["2026Q3"].filter')
    html = html.replace('2025년 3분기부터 2026년 2분기까지','2025년 4분기부터 2026년 3분기까지').replace('2025 Q3 – 2026 Q2','2025 Q4 - 2026 Q3').replace('2025 Q3 · Q4 · 2026 Q1 · Q2','2025 Q4 · 2026 Q1 · Q2 · Q3')
    pct = (latest[0][2]-prior[0][2])/prior[0][2]*100
    rate = latest[0][4]-prior[0][4]
    fraud = next(x for x in latest if x[1]=='사기')
    election = next(x for x in latest if x[0]=='선거범죄')
    prev_election = next(x for x in prior if x[0]=='선거범죄')
    insights = f'''<article><b>01 · TREND</b><strong>직전 분기 발생 {pct:+.1f}%</strong><p>2026년 3분기 발생 {latest[0][2]:,}건, 검거 {latest[0][3]:,}건입니다. 발생 대비 검거비는 {latest[0][4]:.1f}%로 직전 분기 대비 {rate:+.1f}%p입니다. 분기 잠정통계이며 계절·인구 변화를 보정한 값이 아닙니다.</p></article>
      <article><b>02 · STRUCTURE</b><strong>사기 발생 비중 {fraud[2]/latest[0][2]*100:.1f}%</strong><p>사기 {fraud[2]:,}건은 전체 발생건수 기준 비중입니다. 사기의 발생 대비 검거비는 {fraud[4]:.1f}%입니다. 인원·법인체 열과 건수를 합산하지 않습니다.</p></article>
      <article><b>03 · QUARTER</b><strong>선거범죄 {prev_election[2]:,} → {election[2]:,}건</strong><p>2026년 2분기와 3분기의 발생건수 비교입니다. 분기 증감만으로 원인을 확정하거나 연간 추세로 일반화하지 않습니다.</p></article>'''
    html = re.sub(r'(<div class="insights">).*?(</div></section>)',lambda m:m[1]+'\n      '+insights+'\n    '+m[2],html,flags=re.S)
    html = html.replace('검거율','검거비').replace('발생 − 검거 격차','발생·검거 건수 차이')
    html = html.replace('검거비이','검거비가')
    html = html.replace('<span class="icon">⚖️</span>','<span class="icon">해석</span>').replace('검거인원·법인체가 <b>인원(피의자통계원표)</b>','검거인원은 <b>인원(피의자통계원표)</b>, 법인체는 <b>별도 열</b>')
    html = re.sub(r'<section class="notice"[^>]*>(?:(?!</section>).)*?원출처 재대조.*?</section>', '<section class="notice source-review"><span class="icon">원문</span><p><b>원출처 대조 완료 · 2026년 3분기:</b> 공식 전국 원PDF 5개 분기의 215행·1,075개 수치를 대조했습니다. 화면은 최근 4개 분기 172행이며 최신 자료는 7~9월 전체 분기입니다. 실제 게시일은 미확인이고 잠정통계의 추후 수정 가능성은 유지합니다. <a href="/research/source-reviews/2026-11-01-crime-source.json">대조 기록</a></p></section>',html,flags=re.S)
    html = html.replace('15개 대분류, 42개 죄종', '15개 대분류와 총계·소계 포함 43개 행').replace('15개 대분류 · 42개 죄종','15개 대분류 · 총계·소계 포함 43행').replace('CSV 5종 제공','최근 4분기 CSV · 이전 분기 보관')
    source_html = f'''<section class="panel"><div class="sources" style="overflow-wrap:anywhere"><b>자료 범위와 출처</b><p>경찰청 「범죄 발생 및 검거 현황(경찰청 외 18개 시·도청)」 분기 잠정통계입니다. 화면은 2025년 4분기~2026년 3분기이며, 최신 기준은 2026-07-01~2026-09-30입니다. 9월 단월·10월 자료가 아닙니다. 발생·검거는 통계원표 건수, 검거인원은 인원, 법인체는 별도 열입니다. 검거비는 검거건수÷발생건수×100이며 개별 사건의 추적 검거확률을 뜻하지 않습니다.</p><p>실제 수집 완료(UTC): {meta['collectedAt']}<br>변환 파일 생성·수치 확인(UTC): {built_at}<br>원PDF 생성/수정 표기: {document_timestamp(sources[-1]['pdfModificationDateRaw'])}. 실제 게시일은 미확인입니다. 수집일·PDF 생성일을 통계 기준일이나 게시일로 바꾸지 않습니다. 잠정통계는 원문 수정 시 달라질 수 있습니다.</p><p><a href="data/분기 통계.json" download>5개 분기 JSON</a> · <a href="data/출처 시각.json" download>출처·시각 JSON</a> · <a href="/research/source-reviews/2026-11-01-crime-source.json">원출처 대조 기록</a></p><p>공식 전국 원PDF: '''+' · '.join(f'<a href="{x["sourceUrl"].replace("&","&amp;")}" target="_blank" rel="noopener">{labels[x["quarter"]]}</a>' for x in sources)+'''</p><p>이전 화면의 2025년 3분기 CSV는 <a href="data/crime_2025q3.csv">보관 자료</a>로 유지합니다. 총계·소계와 세부 행을 함께 더하면 중복 집계됩니다.</p></div></section>'''
    html = re.sub(r'<section class="panel"><div class="sources"[^>]*>.*?</div></section>',lambda _:source_html,html,flags=re.S)
    # Preserve the existing renderer, chart controls and CSV download handlers.
    outputs[page] = html.encode('utf8')
    for target, data in outputs.items():
        target.write_bytes(data)
    print(json.dumps({'quarters':5,'rows':215,'numericCells':1075,'historicalChangedCells':len(changes),'latestTotal':latest[0],'generatedAt':built_at},ensure_ascii=False))

if __name__ == '__main__':
    main()
