# GH 청약정보 관측소

경기주택도시공사 GH주택청약·임대센터의 공개 공고를 수집해 Supabase에 누적하는 STARGATE 연구 대시보드입니다.

- Live: https://www.stargateedu.co.kr/gh-sale-info/
- API: `/api/gh-sale-info`
- 수집 대상: 임대주택 / 임대상가 / 매입임대
- 저장: 기존 LH 파이프라인의 `lh_sale_notices`, `lh_sale_fetch_logs` 재사용
- GH 구분키: `pan_id=gh:<source>:<pbancNo>`, `upp_ais_tp_cd=GH_*`
- 일일 수집: 기존 `/api/cron/daily-collect` 파이프라인에 포함
- API 함수: Vercel Hobby 함수 수를 늘리지 않도록 `api/[resource].js` 통합 라우터 사용
