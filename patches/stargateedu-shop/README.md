# Stargate Edu Shop

정적 스토어프론트 + NHN KCP(Lite Pay) 결제 연동 준비 저장소입니다.

- Live domain: `https://shop.stargateedu.co.kr`
- Portal refund center: `https://stargateedu.co.kr/refund/`

## 심사·운영에 필요한 공개 정보

푸터/결제 준비 화면에 아래 정보가 노출됩니다.

- 상호: 주식회사 별의문
- 대표: 정동수
- 사업자등록번호: 848-86-03835
- 통신판매업신고: 2025-서울강남-05246호
- 주소: 서울특별시 강남구 삼성로63길 8-15, 204호 (대치동)
- 전화: 070-8018-8227
- 개인정보보호책임자: 정동수
- 이메일: ceo@stargateedu.co.kr

## 결제 흐름 (NHN KCP Lite Pay)

1. `/checkout.html?product=...` — 약관·개인정보·환불(구독 시 정기결제) 동의 후 준비
2. `POST /api/kcp/ready` — 서버 카탈로그 금액 검증 + KCP 거래등록
3. KCP 결제창 인증
4. `POST /api/kcp/return` — 인증 데이터 수신 브리지
5. `POST /api/kcp/approve` — 서버에서 승인(금액·주문번호 재검증)

자격증명이 없으면 ready API는 `503 KCP_CREDENTIALS_MISSING`을 반환하며, 실결제 없이 심사 UI·약관 고지는 확인 가능합니다.

## Vercel 환경변수

`.env.example` 참고:

- `KCP_SITE_CD`
- `KCP_CERT_INFO` (PEM, `\n` 허용)
- `KCP_PRIVATE_KEY` (PEM, 서명용)
- `KCP_ENV` = `test` | `live`
- `CHECKOUT_SIGNING_SECRET`
- `SITE_ORIGIN=https://shop.stargateedu.co.kr`

정적 GitHub Pages만으로는 `/api/*`가 동작하지 않으므로, 결제 API는 Vercel에 연결해야 합니다.

## 남은 외부 의존성

- NHN KCP 계약·사이트코드·서비스 인증서·개인키 발급
- 정기결제(배치키) 별도 계약이 필요한 자동결제 연장
- DNS를 Vercel로 연결하거나 Pages + API 도메인을 분리 운영
