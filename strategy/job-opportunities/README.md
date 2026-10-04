# 채용·체험공고 피드 설정

## 고용24 OPEN-API

이 대시보드는 고용24 채용정보 OPEN-API의 최근 3일 공고를 가져와 적합도 기준 TOP 20을 만듭니다. API 문서에 따르면 인증키는 고용24 기업회원이 별도로 신청하고 심사를 받아 발급받아야 합니다. 공공데이터포털의 `DATA_GO_KR_API_KEY`와는 다른 키입니다.

1. 고용24 기업회원으로 로그인해 [OPEN-API 서비스 신청](https://www.work24.go.kr/cm/e/a/0110/selectOpenApiSvcInfo.do?bbsClCd=OosccI71O3P2dBxVz5A40Q%3D%3D)에서 채용정보 API를 신청합니다.
2. 승인 후 `WORK24_AUTH_KEY`를 GitHub 저장소 Settings → Secrets and variables → Actions에 Actions secret으로 등록합니다. 키를 코드나 공개 이슈에 넣지 않습니다.
3. `Update daily job opportunities` 워크플로를 수동 실행해 확인합니다. 매일 00:00 UTC (한국시간 09:00)에 자동 실행됩니다.
4. `strategy/job-opportunities/data/latest.json`에서 `mode: "authorized"`, `source: "고용24 OPEN-API"`, 최근 갱신 시각과 공고 수를 확인합니다. 대시보드도 새 데이터와 원문 링크를 표시해야 합니다.

응답은 공식 XML API에서 읽습니다. 한 번에 100건씩 최근 3일을 조회하며 현재 최대 10페이지(1,000건)까지 처리합니다. 전체 결과가 1,000건을 넘으면 데이터 파일의 `truncated`가 `true`가 되고 대시보드에 조회 건수와 전체 건수를 함께 표시합니다. 오류나 인증 실패는 샘플 데이터로 덮지 않고 워크플로를 실패시켜 기존 성공 데이터를 보존합니다.

API에서 마감일을 제공하지 않은 공고는 임의 날짜를 만들지 않고 `마감 미표기`로 표시합니다. 이미 마감일이 지난 공고는 선별에서 제외합니다.

## 승인된 CSV·JSON 피드 대안

기존 `JOB_FEED_URL`, 선택적 `JOB_FEED_TOKEN`, `JOB_FEED_LICENSED` 설정도 유지합니다. 고용24 키가 등록되면 고용24가 우선 사용됩니다. 공개 구인 사이트 페이지를 허가 없이 크롤링하지 않습니다.
