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
