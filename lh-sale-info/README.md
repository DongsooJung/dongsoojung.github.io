# LH 분양정보 관측소

한국토지주택공사 **분양임대공고문** Open API에서 분양 정보를 30건씩 조회하고 Supabase에 저장하는 연구 대시보드입니다.

- Live: https://www.stargateedu.co.kr/lh-sale-info/
- API: `lhLeaseNoticeInfo1` (공지사항 `lhNotice*` 아님)
- 기본 유형: `UPP_AIS_TP_CD=05` (분양주택)
- 서버 프록시: `POST /api/lh-sale-info`

## 사용 방법

1. Supabase SQL Editor에서 [`../supabase/lh_sale_info.sql`](../supabase/lh_sale_info.sql) 실행
2. 공공데이터포털에서 **분양임대공고문 조회 서비스** 활용신청
3. 페이지에서 serviceKey 확인 후 **30건 불러오기·저장**

## 환경 변수 (Vercel / Actions)

| 변수 | 설명 |
|------|------|
| `DATA_GO_KR_API_KEY` | 공공데이터포털 인증키 |
| `SUPABASE_URL` | 선택 (기본 Stargate 프로젝트) |
| `SUPABASE_SERVICE_KEY` | upsert/로그 쓰기용 (권장) |
| `SUPABASE_ANON_KEY` | service key 없을 때 대안 |

## 원출처 대조용 조회

`POST /api/lh-sale-info`에서 `saveToSupabase: false`는 정상 응답과 오류 모두 공고 upsert·성공/실패 로그 저장을 생략합니다. GET collect의 문자열 `false`도 같은 의미입니다. 상태 GET 실패는 오류 로그를 쓰지 않습니다. 기본 저장 동작은 유지하며 오류 로그 매개변수에는 인증키를 포함하지 않습니다. `collectorVersion: 20261101-read-only-v1`이 실제 서버에 배포된 것을 확인한 후 원출처 대조에 사용하세요. `node --test lh-sale-info/test-parser.mjs lh-sale-info/test-read-only.mjs`로 쓰기 차단 경로를 검증합니다. 포털 병합은 별도 프록시의 배포 완료를 뜻하지 않습니다.
