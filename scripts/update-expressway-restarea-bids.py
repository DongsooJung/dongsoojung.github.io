#!/usr/bin/env python3
from __future__ import annotations
import json,re
from datetime import datetime,timezone,timedelta
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'strategy'/'expressway-restarea-bid'/'data'/'opportunities.json'
KST=timezone(timedelta(hours=9))
SOURCES=[('한국도로공사 공지사항','https://www.ex.co.kr/portal/biz/bbs/layout1/selectBoardList.do?bbsId=BBSMSTR_000000000182'),('한국도로공사 보도자료','https://www.ex.co.kr/portal/biz/bbs/layout1/selectBoardList.do?bbsId=BBSMSTR_000000000183'),('한국도로공사 매장현황','https://ex.co.kr/portal/biz/svarFnd/selectFndPbanList.do')]
KEYWORDS=('휴게소','주유소','매장','임대','운영','입찰','공모','모집','전기차','충전','편의점','푸드코트','커피','창업','서비스','모니터링','용역','통신','정보','시스템','스마트','매각')
def clean(t): return re.sub(r'\s+',' ',t or '').strip()
def category(t):
    if any(k in t for k in ('전기차','충전','스마트','통신','정보','시스템')): return '전기차·스마트시설'
    if any(k in t for k in ('창업','매장','임대','편의점','푸드','커피')): return '전문매장·임대'
    if any(k in t for k in ('용역','모니터링','조사')): return '용역·데이터'
    return '공사·용역·물품'
def score(t,c):
    s=60+(12 if '휴게소' in t else 0)+(10 if any(k in t for k in ('입찰','공모','모집','임대')) else 0)+(8 if c in ('용역·데이터','전기차·스마트시설') else 0)+(6 if any(k in t for k in ('데이터','정보','시스템','모니터링')) else 0)
    return min(s,98)
def fit(c): return {'용역·데이터':'직접','전문매장·임대':'파트너형','전기차·스마트시설':'컨소시엄'}.get(c,'직접·컨소시엄')
def collect(name,url):
    r=requests.get(url,timeout=20,headers={'User-Agent':'STARGATE-public-opportunity-radar/1.0'});r.raise_for_status();r.encoding=r.apparent_encoding or r.encoding
    soup=BeautifulSoup(r.text,'html.parser');out=[]
    for a in soup.find_all('a',href=True):
        title=clean(a.get_text(' ',strip=True))
        if len(title)<5 or not any(k in title for k in KEYWORDS): continue
        c=category(title);out.append({'title':title,'organization':'한국도로공사','category':c,'region':'전국/공고참조','deadline':'공고참조','status':'확인필요','score':score(title,c),'fit':fit(c),'reason':'공개 공공홈페이지에서 자동 수집. 참가자격·마감일·실적요건은 원문 확인 필요.','url':urljoin(url,a['href']),'source':name})
    return out
def main():
    payload=json.loads(DATA.read_text(encoding='utf-8')) if DATA.exists() else {'opportunities':[]};seeds=payload.get('opportunities',[]);collected=[];status={}
    for name,url in SOURCES:
        try:
            items=collect(name,url);collected.extend(items);status[name]=f'ok:{len(items)}'
        except Exception as e: status[name]=f'error:{type(e).__name__}'
    merged={}
    for item in seeds+collected: merged[(item.get('title',''),item.get('url',''))]=item
    items=sorted(merged.values(),key=lambda x:int(x.get('score',0)),reverse=True)[:250]
    DATA.write_text(json.dumps({'updatedAt':datetime.now(KST).isoformat(timespec='seconds'),'sourceStatus':status,'opportunities':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'saved {len(items)} opportunities')
if __name__=='__main__': main()
