# STARGATE 비상장주식 인텔리전스 (MVP v0.2)

- 경로: `/unlisted-stocks/`
- 앱 연동: Stargate Google Play TWA는 `stargateedu.co.kr`을 표시하므로, 웹 포털 메뉴에서 이 경로로 진입할 수 있습니다. 별도의 AAB 재빌드 없이 웹 기능을 업데이트할 수 있습니다.
- 구현: 정적 HTML/CSS/vanilla JavaScript, 로그인/외부 라이브러리 없음.
- 기준: 2026-10-28 공개 K-OTC 시장정보의 거래대금 상위 5개 종목에 대한 **날짜 고정 스냅샷**. 실시간 업데이트 기능은 **없습니다**.
- 출처: https://www.k-otc.or.kr/public/main , https://www.k-otc.or.kr/public/item/presentPrice , https://opendart.fss.or.kr/

## 사용 방법

1. 포털 상단 **비상장주식** 메뉴 또는 프로젝트 카드로 진입합니다.
2. 종목 검색, 분류 필터, 거래대금/거래량 지표를 선택합니다.
3. 관심기업 ☆을 눌러 이 브라우저의 로컬 저장소에 보관합니다.
4. 기업을 선택한 뒤 공시·시세 원천 링크로 실제 정보를 검증합니다.
5. 기업의 확인된 EPS와 적정 PER 가정을 직접 입력하면 `EPS × PER` 방식의 참고 가격을 계산합니다.
6. 데이터를 보완하려면 UTF-8 CSV 파일을 가져오고, 내보내기로 현재 표를 저장합니다.

CSV 헤더:
```csv
name,code,market,price,volume,value,date
예시기업,EXAMPLE01,비상장,,,,2026-10-28
```

CSV 저장은 브라우저 안에서 처리합니다. 가져온 데이터/관심기업은 localStorage에 저장되며 원격 서버로 보내지 않습니다. 가져온 데이터가 공식적으로 검증된 가격이라는 뜻은 아닙니다.

## 데이터 품질과 위험

- 단 1일의 시장 스냅샷으로 가격 차트, 상승률, 수익률을 만들지 않습니다.
- 표시 종목의 거래대금 총합을 K-OTC 전체 시장 규모로 부르지 않습니다.
- 비상장기업은 공시가 없거나 일부 정보가 비공개일 수 있습니다.
- 시세 자동 수집 또는 상업적 재배포는 데이터 제공기관의 이용 조건 및 사용권 검토 후에만 추가합니다.
- OpenDART API 호출이 필요하면 **서버/서버리스 함수에서 비밀키를 관리**합니다. 브라우저 HTML에 API 키를 넣지 않습니다.
- 매매 중개, 사용자 자산 관리, 맞춤 투자권유를 제공하지 않습니다.

## OpenDART 자동 수집 · IPO 공시 모니터링 (v0.2)

- 수집기: `scripts/update-unlisted-dart.py`; 예약 실행: `.github/workflows/update-unlisted-dart.yml` (평일 09:35 KST).
- 공개 스냅샷: `unlisted-stocks/data/opendart.json`; 브라우저 렌더러: `unlisted-stocks/dart-insights.js`.
- API 인증키는 GitHub Actions secret `OPENDART_API_KEY` 또는 `DART_API_KEY`로만 사용합니다. 브라우저·JSON으로 유출하지 않습니다.
- 시세표 5개 기업만 대상으로, 고유번호 ZIP에서 유일한 정확 회사명 매칭을 확인한 경우에만 해당 기업의 재무 API를 조회합니다.
- 사업연도 및 반기 재무제표를 연결(CFS) 우선, 없으면 별도(OFS)로 구분해 표시합니다. 중간기간 손익은 누적 금액을 사용합니다.
- 최근 60일 OpenDART 기타법인(E)의 지분증권(C001) 공시를 조회합니다. 화면은 최대 30건을 표시합니다.
- 증권신고서 제출은 IPO 신청·승인·상장을 증명하지 않습니다. 상장예비심사/공모는 [KRX KIND](https://kind.krx.co.kr/external/dst/main/main_contents.htm)에서 확인하세요.
- API 수집 실패 시 마지막 검증 스냅샷을 유지하고, 인증키 미설정 상태는 숫자를 임의로 채우지 않습니다.
- 로컬 테스트: `python -m unittest discover -s tests -p 'test_unlisted_dart.py'`.

공식 문서: [OpenDART 고유번호](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019018), [재무제표](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019020), [공시검색](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS001&apiId=2019001).

**운영 검증:** 워크플로 실행 성공 → JSON의 `status=ok`, `updated_at` 확인 → 기업명/보고기간/공시 원문 대조.
## 다음 개발 단계

1. 정식 시세 공급 계약 또는 허가된 피드 확보: 종목·체결일·종가·거래량·기준시간 포함, 라이선스 및 재배포 조건 검토.
2. OpenDART 기업검색 범위를 확대하고 감사보고서·정정공시까지 활용해 재무지표를 보강.
3. 비교기업 평가모형: EV/EBITDA·PER·PBR·희석 주식 수·유동성 할인·시나리오 분석; 대상기업/재무 기간 정합성 테스트.
4. 증권사 연결이나 투자자문 기능 추가 전 인허가·법률 검토.
