# STARGATE 비상장주식 인텔리전스 (MVP v0.4)

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
## IPO 신고서 일정 자동 갱신 (v0.3)

- 신규 일정 수집기: `scripts/update-ipo-calendar.py`. 평일 09:55 KST GitHub Actions `Refresh IPO filing calendars`에서 실행합니다.
- OpenDART `list.json` 비상장/기타법인 E의 최근 90일 지분증권 신고서를 검색한 뒤, 고유번호에 유일하게 매칭되는 법인에만 `estkRs.json`을 호출합니다.
- 대시보드 `ipo-calendar.js`는 `data/ipo-calendar.json`에 저장된 **신고서상 청약일·납입기일·신고서상 모집가액**만 표시합니다.
- `sbd` 청약기일이 명확한 ISO 유사 형식일 때만 날짜를 정규화하며, 복잡한 텍스트는 원문 그대로 표시합니다. **공모주 일반청약 확정, IPO 신청 승인, 상장예정일로 바꾸어 표현하지 않습니다.**
- 검색 결과는 최대 8페이지, 기업 최대 35곳, 보고서 100건으로 제한합니다. 데이터에는 조회 범위 및 잘림 여부(`coverage.truncated`, `issuer_limit_reached`)를 저장하며 완전한 국내 IPO 목록이 아닙니다.
- 초기 JSON은 `not_connected`입니다. GitHub Actions secret `OPENDART_API_KEY` 또는 `DART_API_KEY`가 설정되어 수집이 성공하면 `ok`로 바뀝니다.
- KRX KIND 예비심사(청구/승인/철회/미승인/상장완료)는 **OpenDART에서 얻을 수 없으므로 별도 인증된 데이터 공급원의 발표일과 공식 원문을 검증한 경우에만** `data/kind-verified.json`에 반영됩니다.
- 데이터 수집기 `scripts/update-kind-ipo-feed.py`는 scraping을 하지 않습니다. **정식 이용 계약에 따라 제공된 JSON 피드**를 사용할 경우에만 GitHub Actions secrets `IPO_KIND_FEED_URL`, `IPO_KIND_FEED_TOKEN`(선택), repository variable `IPO_KIND_ALLOWED_HOST`를 설정합니다.
- 공급 피드는 HTTPS/호스트 allowlist/공인 IP 검사/리다이렉트 차단/용량 제한 및 KIND·KRX 원문 링크 검증을 통과해야 합니다. 공급 미연결 상태에서는 예비심사 '확정' 표시가 나오지 않습니다.
- CSV는 클라이언트 내에서 생성하며, 원천 접수번호를 포함합니다. 별도 투자계좌/개인정보를 수집하지 않습니다.
- 로컬/Actions 검증: `python -m unittest discover -s tests -p 'test_ipo_calendar.py' -v`, `node --check unlisted-stocks/ipo-calendar.js`.

원천 자료: [OpenDART 지분증권 API](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS006&apiId=2020054) · [KRX 상장 절차](https://listing.krx.co.kr/contents/LST/03/03020000/LST03020000.jsp) · [KRX KIND](https://kind.krx.co.kr/external/dst/main/main_contents.htm).

**이용권 주의:** 금융위원회 및 예탁결제원 제공 일부 공공데이터는 상업적 재사용·재배포가 제한됩니다. 계약이 없는 KRX 데이터는 수집·공개하지 않습니다.
## 다음 개발 단계

1. 정식 시세 공급 계약 또는 허가된 피드 확보: 종목·체결일·종가·거래량·기준시간 포함, 라이선스 및 재배포 조건 검토.
2. OpenDART 기업검색 범위를 확대하고 감사보고서·정정공시까지 활용해 재무지표를 보강.
3. 비교기업 평가모형: EV/EBITDA·PER·PBR·희석 주식 수·유동성 할인·시나리오 분석; 대상기업/재무 기간 정합성 테스트.
4. 증권사 연결이나 투자자문 기능 추가 전 인허가·법률 검토.

## IPO 신규 공시 변경 알림 (v0.4)

- `scripts/build-ipo-alerts.py`가 공식 OpenDART 일정 스냅샷을 이전 수집 이력과 비교해 **신규 접수번호 및 청약일·납입일·신고서 가격 조건 변경**을 감지합니다.
- 최초 실행에서는 기존 자료를 '새 공시'라고 오인하지 않도록 알림 없이 기준선(`baseline_created`)만 생성합니다.
- 종목이 제한된 검색에서 일시적으로 사라졌다가 다시 나오더라도 동일 접수번호를 중복 알림하지 않습니다. 수집 범위는 전체 IPO 시장이 아닌 앞서 정의한 제한된 표본입니다.
- `unlisted-stocks/data/ipo-alerts.json`은 GitHub Actions 평일 수집 후 공개되며 `ipo-alerts.js`가 화면에 표시합니다. 사용자가 읽은 알림은 해당 기기의 `localStorage`에만 기록됩니다.
- 실시간 모바일 푸시·개인 이메일 발송은 아직 구현하지 않았습니다. 페이지 새로고침 또는 갱신 버튼으로 확인합니다.
- KRX 정식 라이선스 데이터가 연결된 경우에만 예심 관련 변경을 추적합니다. 계약 없이 KIND를 스크래핑하지 않습니다.
- KRX/코스콤 문의는 담당자 회신과 데이터 재배포 범위를 별도로 확인해야 합니다. 무단 API 호출 또는 라이선스 체결을 뜻하지 않습니다.
- 테스트: `python -m unittest discover -s tests -p 'test_ipo_alerts.py' -v`, `node --check unlisted-stocks/ipo-alerts.js`.
