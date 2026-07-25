# 공공데이터 수집 기록소

공공데이터포털(data.go.kr) API를 선택해 버튼(또는 주기 반복)으로 수집하고, CSV로 변환한 뒤 Supabase Storage에 저장하는 페이지입니다.

- Live: https://www.stargateedu.co.kr/public-data-collector/
- API: `POST /api/public-data-collector`

## 기능

- API 4종 선택 수집: 부동산 실거래 / 상권정보 / 소상공인 업종 / 기상청 단기예보
- CSV 생성(UTF-8 BOM) + 브라우저 다운로드
- Supabase Storage 버킷 `public-data-csv` 업로드
- 수집 로그 테이블 `public_data_collection_logs` 기록
- 탭이 열려 있을 때 1/6/24시간 자동 반복

## 배포 전 준비

1. Supabase SQL Editor에서 [`../supabase/public_data_collector.sql`](../supabase/public_data_collector.sql) 실행
2. Vercel(또는 동일 Node 런타임) 환경변수 설정

| 변수 | 설명 |
|------|------|
| `DATA_GO_KR_API_KEY` | 공공데이터포털 인증키 (인코딩/디코딩 키 모두 가능) |
| `SUPABASE_URL` | 기본값 `https://inftexpcnfinglwlrvsj.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Storage 업로드·로그 INSERT용 service role 키 |

## serviceKey 주의

인코딩 키의 `%2F` 등을 `URLSearchParams`/`params=`로 넣으면 `%25`로 재인코딩되어 403이 납니다.
`/api/public-data-collector`는 키를 URL에 직접 결합해 이중 인코딩을 막습니다.

## 로컬 스모크

```bash
node --test public-data-collector/test-encoding.mjs
```
