# 공공데이터 수집 기록소

공공데이터포털(data.go.kr) API를 선택해 **버튼(또는 주기 반복)** 으로 수집하고, CSV로 변환한 뒤 **Supabase Storage**에 저장하는 페이지입니다.

- Live: https://www.stargateedu.co.kr/public-data-collector/
- 브라우저 수집: `collector.js` (GitHub Pages에서 바로 동작)
- 서버/배치: `POST /api/public-data-collector`, `scripts/collect-public-data.mjs`

## 사용 방법

1. Supabase SQL Editor에서 [`../supabase/public_data_collector.sql`](../supabase/public_data_collector.sql) 실행
2. 페이지에서 공공데이터포털 인증키 입력 (localStorage에만 저장)
3. API 체크 후 **선택 목록 수집** 클릭
4. CSV 미리보기·다운로드·Supabase 공개 URL 확인

탭을 열어 둔 채 자동 반복(1/6/24시간)을 켤 수 있습니다.

## 수집 API

| id | 이름 | 기본 조건 |
|----|------|-----------|
| `apt_trade` | 부동산_실거래가 | 강남구 · 전월 |
| `store_dong` | 서울_상권정보 | 역삼1동 |
| `store_upjong` | 소상공인_상권분석 | 음식업 · 대치2동 |
| `village_fcst` | 기상청_단기예보 | 강남 격자 |

## GitHub Actions (무인 주기 수집)

워크플로: `.github/workflows/collect-public-data.yml` (매일 00:10 KST + 수동 실행)

필요 Secrets:

| Secret | 설명 |
|--------|------|
| `DATA_GO_KR_API_KEY` | 공공데이터포털 인증키 |
| `SUPABASE_SERVICE_KEY` | Storage/로그 쓰기용 (권장) |
| `SUPABASE_ANON_KEY` | service key 없을 때 대안 |
| `SUPABASE_URL` | 선택 (기본 Stargate 프로젝트) |

## serviceKey 주의

인코딩 키의 `%2F` 등을 `URLSearchParams`로 넣으면 `%25`로 재인코딩되어 403이 납니다.
이 프로젝트는 키를 URL에 직접 결합해 이중 인코딩을 막습니다.

```bash
node --test public-data-collector/test-encoding.mjs
```
