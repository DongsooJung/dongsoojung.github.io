# 금융위원회 기업재무 대시보드

금융위원회 기업 재무정보(요약재무제표) API를 **100건씩** 조회하고 Chart.js로 시각화하는 연구 대시보드입니다.

- 페이지: `/fsc-financial/`
- API: `GetFinaStatInfoService_V2` / `getSummFinaStat_V2`
- 키: 브라우저 localStorage (`stargate-data-go-kr-key`, 수집 기록소와 공유)
- 샘플: `data.json` (2023년 1페이지 100건)

## 로컬 확인

정적 서버로 `fsc-financial/`을 연 뒤 API 키를 입력하고 **100건 불러오기**를 누르면 됩니다.
