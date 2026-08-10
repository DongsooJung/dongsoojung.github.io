# DongsooJung.github.io

정동수(Dongsoo Jung) 개인 포털 · GitHub user site.

- Live: https://dongsoojung.github.io/
- Featured sub-project: https://dongsoojung.github.io/stargate-ai-gallery/

## 구성

- `index.html` — 포털 랜딩 페이지 (프로젝트 카드 그리드 + About)
- `portfolio/` — 외부 링크용 선별 포트폴리오 허브 (`https://www.stargateedu.co.kr/portfolio/`)
- `strategy/kimstudy-math/` — 승인된 김과외 과외학생 문의·수요 전략 테이블(페이지당 100건, 매일 자동 갱신)
- `strategy/used-car/` — 중고차 일일 가격 전략 대시보드(합성 층화표본 300건·승인 CSV/JSON 피드, 95% 신뢰구간·표본오차, 페이지당 100건, 매일 09:30 KST 갱신)
- `strategy/job-opportunities/` — 채용·체험공고 적합도 일일 TOP 20(JSON·CSV·날짜별 보관, 매일 09:00 KST 갱신)
- `portfolio/blog/` — Notion API + Google Drive API 연동 포트폴리오 블로그
- `api/portfolio-notion.js` — Notion 공개 글 라이브 프록시 (Vercel env: `NOTION_API_KEY`)
- `blog/` — [blog.stargateedu.co.kr/posts/](https://blog.stargateedu.co.kr/posts/) 리디렉션
  (노션 블로그는 2026-08 에 blog 서브도메인 [stargate-blog-hub](https://github.com/DongsooJung/stargate-blog-hub) 로 이전)
- `404.html` — 커스텀 404
- `CNAME` — 커스텀 도메인 `stargateedu.co.kr`
- `manifest.webmanifest` / `sw.js` / `offline.html` / `assets/icons/` — PWA (앱 설치 요건)
- `.well-known/assetlinks.json` — Android 앱(TWA) 도메인 소유 증명
- `privacy.html` — 개인정보처리방침 (Play Store 필수)
- `app/` — Google Play용 Stargate 앱(TWA) 빌드 설정 → [app/README.md](app/README.md)
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
