# 검색 유입 주간 점검

기준: `https://stargateedu.co.kr/`의 Google Search Console 도메인 또는 URL 접두어 속성. 실제 소유권과 접근 권한을 확인한 뒤 속성 이름·담당자·첫 기준 주를 기록한다. 현재 이 저장소만으로는 Search Console의 실제 색인·노출·클릭 수를 확인할 수 없으므로 기준값은 **미확인**이다.

## 매주 같은 요일에 기록

| 항목 | 확인 위치·방법 | 기준값 | 이번 주 | 직전 주 |
| --- | --- | --- | --- | --- |
| 핵심 URL 색인 수 | URL 검사 또는 페이지 색인 보고서에서 아래 핵심 URL의 색인 상태를 개별 확인 | 미확인 |  |  |
| 자연검색 노출 수 | 검색 결과 실적, 최근 완료된 7일과 직전 7일 비교 | 미확인 |  |  |
| 자연검색 클릭 수 | 같은 기간·같은 검색 유형 | 미확인 |  |  |
| 브랜드 외 검색어 클릭 수 | 검색어 표에서 `stargate`, `스타게이트`, `정동수`, `dongsoo` 등 브랜드·인명 검색어를 제외한 클릭 합계. 제외 규칙을 주마다 동일하게 적용 | 미확인 |  |  |
| 핵심 유입 페이지 클릭 수 | 페이지 필터로 핵심 URL을 개별 조회 | 미확인 |  |  |
| 사이트맵 상태 | 사이트맵 보고서에서 제출 여부, 마지막 읽은 날짜, 상태 확인 | 미확인 |  |  |

핵심 URL: `/`, `/research/`, `/strategy/`, `/koi-coach/`, `/did/`, `/spatial-data-ai/`, `/strategy/platform-financial-analysis/`, `/strategy/ai-financials/`, `/strategy/ai-revenue-comparison/`. 새 URL은 먼저 공개 HTTP 200, canonical, `robots.txt` 허용 여부를 확인한 뒤 URL 검사 결과와 함께 기록한다.

`robots.txt`의 Sitemap 선언은 검색엔진에 경로를 알리지만 Search Console 속성의 **제출 완료**를 뜻하지 않는다. 계정 접속 후 `https://stargateedu.co.kr/sitemap.xml` 및 `https://stargateedu.co.kr/reading/sitemap.xml`의 제출·읽기 상태를 별도로 확인한다. 색인 및 클릭 증가를 배포 완료의 증거로 미리 기록하지 않는다.
