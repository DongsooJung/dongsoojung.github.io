# GH 청약정보 관측소

경기주택도시공사 GH주택청약·임대센터의 공개 공고를 수집해 Supabase에 누적하는 STARGATE 연구 대시보드입니다.

- Live: https://www.stargateedu.co.kr/gh-sale-info/
- API: `/api/gh-sale-info`
- 수집 대상: 임대주택 / 임대상가 / 매입임대
- 저장: 기존 LH 파이프라인의 `lh_sale_notices`, `lh_sale_fetch_logs` 재사용
- GH 구분키: `pan_id=gh:<source>:<pbancNo>`, `upp_ais_tp_cd=GH_*`
- 일일 수집: 기존 `/api/cron/daily-collect` 파이프라인에 포함
- 실행 시각: Vercel 일일 수집 06:10 KST. 다른 수집기 실패와 관계없이 GH를 시도합니다.
- GH 전용 재확인: GitHub Actions `verify-gh-sale-info-live.yml`이 매일 06:25 KST에 수집·저장·재조회를 검증합니다. 예약 실행은 지연될 수 있습니다.
- 정적 홈페이지 API: `https://portfolio-stargate2.vercel.app/api/gh-sale-info` (홈페이지 자체의 `/api/`는 정적 호스팅이라 사용하지 않습니다.)
- GH의 `data-pbancNo` 공고 속성과 생략 가능한 `</td>`를 처리합니다. 공고 게시일·마감일은 각 열의 위치를 유지합니다.
- API 함수: Vercel Hobby 함수 수를 늘리지 않도록 `api/[resource].js` 통합 라우터 사용
