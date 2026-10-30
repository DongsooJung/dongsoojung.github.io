"""Compare a received MOIS active administrative-code ZIP with saved election maps.

This emits a separate code reference. It never rewrites geometry or infers a
successor unit's electoral district. TXT and XLSX are compared independently.
"""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile
from datetime import datetime, timezone
import argparse,csv,hashlib,json,re
from openpyxl import load_workbook

ROOT=Path(__file__).resolve().parents[1]
CITIES={'pyeongtaek':('평택시','41220'),'hwaseong':('화성시','4159'),'suwon':('수원시','4111'),'seongnam':('성남시','4113')}
FIELDS=['administrativeCode','province','municipality','unitName','createdOn','abolishedOn']

def parse_registry(raw,file_date):
    with ZipFile(BytesIO(raw)) as z:
        stem=f'jscode{file_date}/KIKcd_H.{file_date}'
        workbook=load_workbook(BytesIO(z.read(stem+'.xlsx')),read_only=True,data_only=True)
        sheet=workbook['KIKcd_H'];rows=list(sheet.values);workbook.close()
        if rows[0]!=('행정동코드','시도명','시군구명','읍면동명','생성일자','말소일자'):raise ValueError('Unexpected administrative XLSX schema')
        xlsx=[tuple(str(v or '').strip() for v in r) for r in rows[1:]]
        lines=z.read(stem).splitlines()
        if not lines[0].startswith('행정동코드'.encode('cp949')):raise ValueError('Unexpected TXT schema')
        # Official fixed-width CP949 fields; positions follow the supplied header.
        ranges=[(0,10),(11,41),(42,72),(73,103),(104,112),(113,121)]
        text=[tuple(line[a:b].decode('cp949').strip() for a,b in ranges) for line in lines[1:] if line.strip()]
        if xlsx!=text:raise ValueError('Independent TXT/XLSX fields disagree')
        codes=[r[0] for r in xlsx]
        if len(set(codes))!=len(codes) or not all(re.fullmatch(r'\d{10}',c) for c in codes):raise ValueError('Duplicate or invalid administrative code')
        if any(r[5] for r in xlsx):raise ValueError('Expected active-code file, received abolished records')
        return xlsx

def compare(rows,root=ROOT):
    output=[];reviews={}
    for city,(name,prefix) in CITIES.items():
        official={r[0]:r for r in rows if r[0].startswith(prefix) and r[3]}
        if not official:raise ValueError('No official units for '+city)
        geo_file=root/f'{city}-election/data/emd.geojson';raw=geo_file.read_bytes();fc=json.loads(raw)
        cached={f['properties']['emd_cd']:f['properties'] for f in fc['features']}
        if len(cached)!=len(fc['features']):raise ValueError('Duplicate saved code')
        matched=[code for code,r in official.items() if code in cached and cached[code]['emd_nm']==r[3]]
        missing=[{'code':code,'name':r[3],'createdOn':r[4]} for code,r in official.items() if code not in cached]
        absent=[{'code':code,'name':r['emd_nm']} for code,r in cached.items() if code not in official]
        mismatches=[{'code':code,'savedName':cached[code]['emd_nm'],'officialName':r[3]} for code,r in official.items() if code in cached and cached[code]['emd_nm']!=r[3]]
        reviews[city]={'cityName':name,'registryUnits':len(official),'savedUnits':len(cached),'matchingCodeAndName':len(matched),'currentUnitsWithoutSavedGeometry':missing,'savedCodesAbsentFromActiveFile':absent,'nameMismatches':mismatches,'geometrySha256':hashlib.sha256(raw).hexdigest(),'coordinateVerification':'not_verified','sourceBoundaryDate':None}
        for code,r in sorted(official.items()):
            output.append({'city':city,**dict(zip(FIELDS,r)),'savedCodeAndNameMatch':code in matched,'savedElectoralDistrict':cached[code]['district'] if code in matched else '', 'electoralDistrictVerification':'not_verified','geometryVerification':'not_verified'})
    return output,reviews

def main():
    a=argparse.ArgumentParser();a.add_argument('zip',type=Path);a.add_argument('--file-date',required=True);a.add_argument('--notice-date',required=True);a.add_argument('--collected-at',required=True);a.add_argument('--source-url',required=True);a.add_argument('--notice-url',required=True);a.add_argument('--expected-sha256',required=True);args=a.parse_args()
    if not re.fullmatch(r'\d{8}',args.file_date):raise ValueError('Invalid file-date label')
    if datetime.fromisoformat(args.collected_at)>datetime.now(timezone.utc):raise ValueError('Future collection time')
    if not args.source_url.startswith('https://www.mois.go.kr/cmm/fms/FileDown.do?'):raise ValueError('Expected MOIS source URL')
    raw=args.zip.read_bytes();sha=hashlib.sha256(raw).hexdigest()
    if sha!=args.expected_sha256:raise ValueError('Source ZIP hash mismatch')
    rows=parse_registry(raw,args.file_date);output,reviews=compare(rows)
    summary={'schemaVersion':1,'source':{'url':args.source_url,'announcementUrl':args.notice_url,'providerNoticeReferenceDate':args.notice_date,'fileDateLabel':args.file_date,'collectedAt':args.collected_at,'zipSha256':sha},'checkedAt':datetime.now(timezone.utc).isoformat(),'scope':'현행 행정코드·동명만 별도 대조. 선거구 귀속·좌표의 기준일/정확성 검증이 아님.','independentValidation':{'method':'CP949 fixed-width TXT compared field-by-field with XLSX','allRegistryRows':len(rows),'allFieldsChecked':len(rows)*6,'selectedRows':len(output),'selectedFieldsChecked':len(output)*6},'cities':reviews,'rows':output}
    dest=ROOT/'data/election';dest.mkdir(parents=True,exist_ok=True)
    (dest/'administrative-code-review.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    with (dest/'administrative-code-review.csv').open('w',newline='',encoding='utf8') as f:
        writer=csv.DictWriter(f,fieldnames=['city',*FIELDS,'savedCodeAndNameMatch','savedElectoralDistrict','electoralDistrictVerification','geometryVerification','providerNoticeReferenceDate','fileDateLabel','collectedAt']);writer.writeheader()
        for r in output:writer.writerow({**r,**{k:summary['source'][k] for k in ['providerNoticeReferenceDate','fileDateLabel','collectedAt']}})
    print(json.dumps({'officialUnits':len(output),'matched':sum(x['matchingCodeAndName'] for x in reviews.values()),'savedUnits':sum(x['savedUnits'] for x in reviews.values()),'cities':reviews},ensure_ascii=False))

if __name__=='__main__':main()
