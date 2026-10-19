# DongsooJung.github.io

정동수(Dongsoo Jung) 개인 포털 · GitHub user site.

- Live: https://dongsoojung.github.io/
- Featured sub-project: https://dongsoojung.github.io/stargate-ai-gallery/

## 구성

- `index.html` — 포털 랜딩 페이지 (프로젝트 카드 그리드 + About)
- `portfolio/` — 외부 링크용 선별 포트폴리오 허브 (`https://www.stargateedu.co.kr/portfolio/`)
- `strategy/q3-45day/` — 2026년 8월 15일~9월 30일 Q3 잔여 47일 실행계획(7개 영역·43개 과제·브라우저 진행상태 저장). `#homepage-ops`에서 스타게이트 홈페이지 개선·운영의 과거 코드 기록과 현재 미확인 검증 과제를 구분.
- `strategy/kimstudy-math/` — 승인된 김과외 과외학생 문의·수요 전략 테이블(페이지당 100건, 매일 자동 갱신)
- `strategy/used-car/` — 국토교통부 월별 자동차 이전등록 엑셀을 가공한 중고차 시장활동 참고지표(매매 관련 이전등록·12개월 추이·지역별 비교, 개별 매물과 가격 미제공)
- `strategy/onbid-real-estate/` — 차세대 온비드 공식 API 기반 부동산 공매 목록(페이지당 100건) 및 온디맨드 물건상세 조회
- `strategy/job-opportunities/` — 기존 채용공고 샘플 페이지의 블로그 보고서 안내 경로. 공식 통계·보도자료를 읽는 [채용·일경험 동향 보고서](https://blog.stargateedu.co.kr/career-trends/)로 연결합니다.
- `strategy/kstartup/` — 창업진흥원 K-Startup 공식 API를 매일 자동 수집하는 모집 중 지원사업 검색·마감 임박 레이더
- `portfolio/blog/` — Notion API + Google Drive API 연동 포트폴리오 블로그
- `api/portfolio-notion.js` — Notion 공개 글 라이브 프록시 (Vercel env: `NOTION_API_KEY`)
- `api/kstartup.js` — K-Startup 인증키 비공개 프록시와 최근 공고 서버 필터·캐시
- `blog/` — [blog.stargateedu.co.kr/posts/](https://blog.stargateedu.co.kr/posts/) 리디렉션
  (노션 블로그는 2026-08 에 blog 서브도메인 [stargate-blog-hub](https://github.com/DongsooJung/stargate-blog-hub) 로 이전)
- `404.html` — 커스텀 404
- `CNAME` — 커스텀 도메인 `stargateedu.co.kr`
- `manifest.webmanifest` / `sw.js` / `offline.html` / `assets/icons/` — PWA (앱 설치 요건)
- `.well-known/assetlinks.json` — Android 앱(TWA) 도메인 소유 증명
- `privacy.html` — 개인정보처리방침 (Play Store 필수)
- `app/` — Google Play용 Stargate 앱(TWA) 빌드 설정 → [app/README.md](app/README.md)
- `kakao-send/` — 카카오 OAuth + Talk Message REST API 기반 `나에게 보내기` 웹앱
- `.nojekyll` — GitHub Pages가 `.well-known/`을 서빙하도록 Jekyll 비활성화

## 로컬 확인

```powershell
Start-Process "index.html"
```

## SOLAPI 고객 문자 발송

- 화면: `/sms/`
- 서버 함수: `/api/sms`
- 발송 제한: 요청당 최대 10명, 중복 휴대폰 번호 차단
- 환경 변수: `.env.example` 참고

배포 환경에 `SOLAPI_API_KEY`, `SOLAPI_API_SECRET`, 사전 등록한
`SOLAPI_SENDER_NUMBER`, 임의의 긴 `SMS_ADMIN_TOKEN`을 등록해야 실제 발송할 수
있습니다. API 키와 Secret은 브라우저 코드에 넣지 않습니다.

## 배포

main 브랜치 루트 그대로 GitHub Pages 에서 서빙. 푸시 후 1~2분 내 반영.

문자 운영 서버: https://stargate.stargate8225.workers.dev/sms/
서버는 Cloudflare Worker의 암호화된 SOLAPI_API_KEY, SOLAPI_API_SECRET, SMS_ADMIN_TOKEN을 사용합니다. 활성 발신번호를 SOLAPI에서 조회하며 요청 ID를 Durable Object에 예약해 동일 요청 재발송을 차단합니다. SOLAPI 응답 대기 실패 시 발송 내역을 확인한 뒤 새 요청을 시작해야 합니다.

고객관리 화면은 고객 최대 500명, 문구 최대 50개, 최근 발송 요청 200개를 서버 Durable Object에 보관합니다. 고객명·전화번호·분류·수신 동의와 메모를 관리하며, 다른 기기에서도 같은 관리자 인증값으로 불러옵니다. `/api/sms/contacts`, `/api/sms/templates`, `/api/sms/history`, `/api/sms/reports`는 모두 관리자 인증을 요구합니다. 접수 내역과 통신사 최종 결과는 구분합니다. 실제 발송은 SOLAPI 허용 IP 설정이 운영 서버와 맞아야 합니다.

고객관리 로그인은 `/admin/visitors/?sms-login=1`의 기존 Cloudflare Access 관리자 인증을 재사용합니다. 검증 후 8시간 동안 유효한 HttpOnly/Secure 쿠키로 고객관리 API에 연결되며 화면에서 인증값을 입력하지 않습니다. 기본 발신번호는 010-9587-8225이고 SOLAPI 활성 발신번호에 포함된 경우만 선택됩니다.

문자 발송 기본 화면은 최대 5명의 접을 수 있는 고객 입력 목록과 메시지·미리보기·발송 패널로 구성합니다. 별도의 로그인 버튼 없이 발송 시 기존 관리자 인증을 연결합니다. 인증 이동 시 작성 내용은 해당 탭의 sessionStorage에 15분 이내 복원용으로 보관하고 복원 또는 로그아웃 시 삭제하며 수신 동의는 복원하지 않습니다. SMS 화면과 UI 자산은 no-store로 제공합니다.

문자 수신자는 기본 5칸이며 “10명까지 입력” 토글로 최대 10명까지 확장합니다. 6~10번째 입력이 남아 있으면 축소를 막아 숨겨진 고객에게 발송되지 않게 합니다. 일괄 입력·저장 고객 선택·로그인 후 작성 내용 복원에서 6명 이상이면 입력란을 자동으로 확장합니다.
