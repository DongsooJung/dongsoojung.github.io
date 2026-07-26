# 무역 월별 대시보드 — 관세청 국가별 수출입실적(GW)

공공데이터포털 [관세청_국가별 수출입실적(GW)](https://www.data.go.kr/data/15101612/openapi.do)
API를 월 단위로 집계한 인터랙티브 대시보드.
수출은 최종목적국·FOB 신고미화금액, 수입은 원산국·CIF 과세가격미화금액 기준이며,
관세청이 매월 15일경 신고 정정·취하를 반영해 전월까지 자료를 현행화한다.

- 페이지: https://www.stargateedu.co.kr/trade/
- API: `https://apis.data.go.kr/1220000/nationtrade/getNationtradeList`
  (파라미터 `serviceKey`, `strtYymm`, `endYymm`, 응답 XML — `expDlr`·`impDlr`·`balPayments`·`statCd`·`statCdCntnKor1`)

## 구성

| 파일 | 역할 |
|---|---|
| `index.html` | 대시보드 (Chart.js) — KPI 타일 · 수출입 추이 · 무역수지 · 국가별 TOP 10 · 국가 상세 · 표/CSV |
| `fetch_data.py` | API 수집 스크립트 — 월별 총계 + 국가별 상위 40개국을 `data.json`에 기록 |
| `data.json` | 월별 시계열 + 국가별 내역 (단위: 백만 달러) |
| `fallback-data.js` | `data.json`의 JS 폴백 (`file://`·fetch 실패 대비) |
| `../.github/workflows/update-trade-data.yml` | 매월 16일 03:00 UTC 자동 갱신 |

## 자동 갱신 설정

1. 공공데이터포털에서 [국가별 수출입실적(GW)](https://www.data.go.kr/data/15101612/openapi.do) **활용신청** 후 인증키 발급
2. 저장소 **Settings → Secrets and variables → Actions**에 `CUSTOMS_API_KEY`로 **Decoding 인증키** 등록
3. Actions 탭에서 **Update trade data** 워크플로를 수동 실행(workflow_dispatch)하면 즉시 갱신
   — 시크릿 없이 1회 실행할 때는 `api_key` 입력을 사용(공개 저장소에서는 사용 후 키 재발급 권장)
   — 과거 백필이 필요하면 `start_ym`(기본 `2010-01`, 예: `2015-01`)을 지정
   — 로컬/CI에서 환경변수로도 가능: `START_YM=2010-01 CUSTOMS_API_KEY=... python3 trade/fetch_data.py`

키가 등록되기 전까지 대시보드는 **시드(예시) 데이터**(공표 통계 기반 근사 + 추세 연장)를 표시하며,
화면에 시드임이 배지·배너로 표기된다. API 수집이 성공하면 시드는 실측치로 전량 대체된다.

## data.json 스키마

```json
{
  "updatedAt": "2026-07-18",
  "sourceMode": "seed | api",
  "unit": "USD million",
  "latestYm": "2026-06",
  "series":   [{ "ym": "2026-06", "exp": 63500, "imp": 53000, "bal": 10500, "approx": true }],
  "countries": { "2026-06": [{ "cd": "CN", "name": "중국", "exp": 12065, "imp": 11395, "bal": 670 }] }
}
```

`approx: true`는 시드 근사치 표시로, API 수집 시 해당 월이 재수집·확정된다.
확정된 과거 월(총계+국가 상세)은 재호출하지 않고, 정정 반영을 위해 최근 3개월과
결측·approx 월만 재수집한다. 기본 수집 시작은 2010-01이며 `START_YM`으로 더 앞당길 수 있다.
