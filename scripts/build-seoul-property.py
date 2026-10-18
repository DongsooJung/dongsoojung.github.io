"""Aggregate official OA-21275 receipt-year CSVs; keep receipt and contract scope explicit.

No transaction identifier exists in this export. Equal-valued rows can represent
separate transactions and are counted, never silently deduplicated.
"""
import argparse,csv,hashlib,json,statistics
from collections import Counter,defaultdict
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://data.seoul.go.kr/dataList/OA-21275/S/1/datasetView.do'
FIELDS=['접수연도','자치구명','계약일','취소일','건물용도','물건금액(만원)','건물면적(㎡)']
TYPES=['아파트','연립다세대','오피스텔','단독다가구']

def aggregate(sources,as_of,districts):
    end=datetime.strptime(as_of,'%Y-%m-%d').date()
    if end.year!=2026:raise ValueError('This audited comparison is scoped to 2025/2026')
    monthly=defaultdict(Counter);prices=defaultdict(lambda:defaultdict(list));stats=Counter();observed=[];identical=Counter();by_receipt=Counter()
    for receipt,rows in sources:
        for row in rows:
            stats['inputRows']+=1;by_receipt[str(receipt)]+=1
            if any(k not in row for k in FIELDS):raise ValueError('Schema changed; no output published')
            if row['접수연도']!=str(receipt):raise ValueError('Receipt-year filter mismatch')
            city=row['자치구명'];kind=row['건물용도']
            if city not in districts or kind not in TYPES:raise ValueError('Unknown district or building use')
            date=datetime.strptime(row['계약일'],'%Y%m%d').date()
            if date>end:raise ValueError('Future contract date')
            if row['취소일'].strip():
                datetime.strptime(row['취소일'],'%Y%m%d');stats['cancelledRows']+=1;continue
            if date.year not in [2025,2026]:stats['outsideContractYears']+=1;continue
            price=float(row['물건금액(만원)'].replace(',',''));area=float(row['건물면적(㎡)'].replace(',',''))
            if price<=0 or area<0:raise ValueError('Invalid source price/area')
            stats['includedRows']+=1;observed.append(date.isoformat());monthly[date.strftime('%Y-%m')][kind]+=1
            identity=tuple(sorted(row.items()));identical[identity]+=1
            if kind=='아파트' and (date.month,date.day)<=(end.month,end.day):
                if area>0:prices[date.year][city].append(price*3.305785/area)
                else:stats['apartmentRowsWithoutPositiveArea']+=1
    months=[f'{year}-{month:02d}' for year in [2025,2026] for month in range(1,(12 if year==2025 else end.month)+1)]
    series={kind:[monthly[m][kind] for m in months] for kind in TYPES}
    totals=[sum(series[t][i] for t in TYPES) for i in range(len(months))]
    district_data={}
    for city in districts:
        current=prices[2026][city];previous=prices[2025][city]
        if not current or not previous:raise ValueError('Missing comparable apartment district')
        value=statistics.median(current);old=statistics.median(previous)
        # Volume counts all apartment rows, including any without positive area.
        district_data[city]={'price':round(value,2),'yoy':round((value/old-1)*100,2),'n':len(current),'previousN':len(previous),'previousPrice':round(old,2)}
    stats['identicalValueExtraRowsRetained']=sum(n-1 for n in identical.values());stats['receiptRows']=dict(by_receipt)
    stats['contractDateRange']=[min(observed),max(observed)]
    if sum(totals)!=stats['includedRows']:raise ValueError('Monthly sum mismatch')
    return months,series,totals,district_data,dict(stats)

def main():
    p=argparse.ArgumentParser();p.add_argument('--csv-2025',type=Path,required=True);p.add_argument('--csv-2026',type=Path,required=True);p.add_argument('--as-of',required=True);p.add_argument('--collected-at',required=True);p.add_argument('--collected-at-2025');p.add_argument('--collected-at-2026');args=p.parse_args()
    geo=json.loads((ROOT/'assets/seoul_gu.json').read_text(encoding='utf-8'));lookup={f['properties']['name']:f['properties']['name_eng'] for f in geo['features']}
    def sources():
        for year,file in [(2025,args.csv_2025),(2026,args.csv_2026)]:
            with file.open(encoding='cp949',newline='') as f:yield year,csv.DictReader(f)
    months,series,totals,prices,checks=aggregate(sources(),args.as_of,lookup)
    # Separate volume from valid-price sample sizes.
    counts=Counter()
    for _,rows in sources():
        for r in rows:
            if r['건물용도']=='아파트' and not r['취소일'].strip() and r['계약일'][:4]=='2026' and r['계약일']<=args.as_of.replace('-',''):counts[r['자치구명']]+=1
    now=datetime.now(timezone.utc).isoformat()
    meta={'source':'서울 열린데이터광장 OA-21275 공식 전체 CSV','sourceUrl':SOURCE,'receiptYears':[2025,2026],'contractAsOf':args.as_of,'period':'접수연도 2025·2026 자료 중 계약일 2025-01-01~'+args.as_of,'dataPeriod':'2026-10','collectedAt':args.collected_at,'snapshotUpdatedAt':now,'updated_note':'원본 CSV 대조 집계 · 10월 부분 자료 · 신고 지연 및 취소 정정 가능','definition':'접수연도 2025·2026 CSV에서 취소일이 있는 행을 제외하고 계약월로 집계. 동일 값 행도 별도 거래일 수 있어 보존. 원본 거래 식별자가 없어 원장 단위 중복 검증은 불가. 향후 접수된 과거 계약은 이번 범위 밖.','partialMonths':['2026-10'],'certifiedCompleteMonths':[],'files':[{'receiptYear':year,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'downloadUrl':'https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do','downloadMethod':'POST','filterCol':'RCPT_YR','txtFilter':str(year)} for year,file in [(2025,args.csv_2025),(2026,args.csv_2026)]],'validation':checks}
    volume={'meta':meta,'months':months,'types':TYPES,'series':series,'total':totals}
    price_meta={**meta,'metric':'자치구별 개별 아파트 거래의 만원/평 중앙값; 구 중앙값의 평균은 서울 거래가 중앙값이 아님','comparisonPeriod':{'currentStart':'2026-01-01','currentEnd':args.as_of,'previousStart':'2025-01-01','previousEnd':'2025'+args.as_of[4:]},'priceDefinition':'취소되지 않은 아파트·양수 면적의 거래금액(만원)×3.305785/건물면적(㎡) 중앙값. 전년은 같은 월일 창으로 비교.','boundaryVersion':None,'layers':{'price':'2026 동기간 평단가 중앙값(만원/평)','vol':'2026-01-01~'+args.as_of+' 아파트 거래 건수','yoy':'전년 같은 월일 창의 평단가 중앙값 대비(%)'}}
    price={'meta':price_meta,'districts':{lookup[city]:{'ko':city,**values,'vol':counts[city]} for city,values in prices.items()}}
    for data in [volume,price]:
        data['meta']['dataAsOf']=args.as_of
        for file in data['meta']['files']:
            file['collectedAt']=(args.collected_at_2025 if file['receiptYear']==2025 else args.collected_at_2026) or args.collected_at
    years={str(f['properties'].get('base_year')) for f in geo['features']}
    price['meta']['boundaryVersion']=next(iter(years)) if len(years)==1 else None
    price['meta']['boundarySha256']=hashlib.sha256((ROOT/'assets/seoul_gu.json').read_bytes()).hexdigest()
    for name,data in [('seoul_monthly_type',volume),('gu_prices',price)]:
        (ROOT/'assets'/f'{name}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with (ROOT/'assets/seoul_monthly_type.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['계약월',*TYPES,'합계','잠정/완결','접수연도범위','계약자료상한','실제수집시각','원출처'])
        for i,m in enumerate(months):w.writerow([m,*[series[t][i] for t in TYPES],totals[i],'진행월 부분 집계' if m=='2026-10' else '확정 완결 미보장', '2025·2026',args.as_of,args.collected_at,SOURCE])
    with (ROOT/'assets/gu_prices.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.writer(f);w.writerow(['자치구','평단가중앙값(만원/평)','현재아파트거래수','현재가격표본수','전년가격표본수','전년중앙값(만원/평)','동기간변동률(%)','현재기간','전년기간','실제수집시각','원출처'])
        for city in sorted(prices):
            v=prices[city];w.writerow([city,v['price'],counts[city],v['n'],v['previousN'],v['previousPrice'],v['yoy'],'2026-01-01~'+args.as_of,'2025-01-01~2025'+args.as_of[4:],args.collected_at,SOURCE])
    print(json.dumps({'months':len(months),'latestMonth':months[-1],'latestMonthCounts':{t:series[t][-1] for t in TYPES},'septemberTotal':totals[months.index('2026-09')],'octoberPartialTotal':totals[-1],'districts':len(prices),'validation':checks},ensure_ascii=False))
if __name__=='__main__':main()
