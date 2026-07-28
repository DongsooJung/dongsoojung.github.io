# 나라장터 용역 입찰공고 대시보드

조달청 **나라장터 입찰공고정보서비스**의 용역조회 API(`getBidPblancListInfoServc`)를 **100건씩** 조회하고 Supabase에 저장하는 연구 대시보드입니다.

- 대시보드: https://www.stargateedu.co.kr/bid-pblanc-servc/
- 연구 허브: https://www.stargateedu.co.kr/research/
- OpenAPI: https://www.data.go.kr/data/15129394/openapi.do

## 구성

| 경로 | 역할 |
|------|------|
| `bid-pblanc-servc/` | 표 + Chart.js 인터랙티브 시각화 UI |
| `api/bid-pblanc-servc.js` | Vercel(icn1) 프록시 · API 조회 · Supabase upsert |
| `supabase/bid_pblanc_servc.sql` | `bid_pblanc_servc`, `bid_pblanc_servc_fetch_logs` |
| `scripts/apply-bid-pblanc-servc-schema.mjs` | 스키마 적용 헬퍼 |

## 요청 파라미터

- `numOfRows=100`, `pageNo`
- `inqryDiv`: `1` 등록일시 · `2` 입찰공고번호 · `3` 변경일시
- `inqryBgnDt` / `inqryEndDt`: `YYYYMMDDHHMM` (구분 1·3)
- `bidNtceNo`: 공고번호 (구분 2)
- `type=json`

## 인증

페이지에서 serviceKey를 입력하지 않습니다. Vercel(`stargate-bid-api`)에 저장된 `DATA_GO_KR_API_KEY`를 사용합니다.


## 스키마 적용

```bash
node scripts/apply-bid-pblanc-servc-schema.mjs
# 또는 Supabase SQL Editor에서 supabase/bid_pblanc_servc.sql 실행
```

## 참고

data.go.kr는 해외 IP에서 403을 반환할 수 있습니다. 프로덕션에서는 Vercel 서울 리전 프록시(`/api/bid-pblanc-servc`)를 우선 사용합니다.
