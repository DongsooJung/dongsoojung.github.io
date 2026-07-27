# 금융위원회 기업재무 대시보드

금융위원회 기업 재무정보(요약재무제표) API를 **100건씩** 조회하고 Chart.js로 시각화하는 연구 대시보드입니다.

- 페이지: `/fsc-financial/`
- API: `GetFinaStatInfoService_V2` / `getSummFinaStat_V2`
- 키: 페이지에 기본 serviceKey가 내장되어 입력 없이 자동 조회 (고급에서 변경 가능)
- 샘플: `data.json` (2023년 1페이지 100건, API 실패 시 폴백)

## 로컬 확인

정적 서버로 `fsc-financial/`을 열면 기본 키로 첫 100건을 자동 조회합니다.
