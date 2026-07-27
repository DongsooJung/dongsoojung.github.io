# LH 분양정보 관측소

한국토지주택공사 **분양** 정보를 30건씩 모아 Supabase에 저장·조회하는 연구 대시보드입니다.

- Live: https://www.stargateedu.co.kr/lh-sale-info/
- 1순위: 공공데이터포털 `lhLeaseNoticeInfo1` (분양주택 05)
- 2순위(현재 사용): LH 청약플러스 분양공고 HTML (`mi=1027`) 파싱 → Supabase
- 수집 스크립트: `scripts/collect-lh-sale-info.mjs`
- 주기 수집: `.github/workflows/collect-lh-sale-info.yml`

## 왜 폴백이 있나

일부 계정 키는 실거래·재무 API에는 동작하지만 LH `B552555` 계열만 `403 Forbidden`을 반환합니다.
승인/변경신청 후에도 동일하면 OpenAPI 대신 청약플러스 목록을 수집합니다.

## 수동 수집

```bash
DATA_GO_KR_API_KEY=... SUPABASE_ANON_KEY=... node scripts/collect-lh-sale-info.mjs
```
