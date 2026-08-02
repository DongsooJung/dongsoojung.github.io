# DongsooJung.github.io

정동수(Dongsoo Jung) 개인 포털 · GitHub user site.

- Live: https://dongsoojung.github.io/
- Featured sub-project: https://dongsoojung.github.io/stargate-ai-gallery/

## 구성

- `index.html` — 포털 랜딩 페이지 (노션 블로그 피드 + 프로젝트 카드 그리드 + About)
- `blog/` — 노션 API 블로그 파이프라인
  - `sync_notion_blog.py` — 노션 「📰 포털 블로그 포스트」 DB에서 상태=발행 글을 읽어 `posts.json` 생성
  - `posts.json` — 홈 "최신 글" 피드가 렌더링하는 데이터 (Actions가 자동 커밋)
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

## 노션 블로그 발행

홈 상단 "최신 글 · Notion Blog" 피드는 노션에서 바로 발행합니다.

1. 노션 「📰 포털 블로그 포스트」 DB(🌐 홈페이지 & 블로그 대시보드 하위)에 글 작성
   - 속성: 제목 · 요약 · 카테고리(교육·입시/AI·테크/창업·경영/도시·연구/출판·서평/공지) · 발행일 · 외부링크(선택)
2. **상태**를 `발행`으로 변경
3. 매일 KST 03:00 자동 반영 — 즉시 반영하려면 Actions에서 `Update Notion blog posts` 수동 실행

### 최초 1회 설정

1. [notion.so/my-integrations](https://www.notion.so/my-integrations)에서 내부 통합 생성 → 시크릿 복사
2. 노션에서 해당 DB 열기 → `⋯` → 연결(Connections) → 만든 통합 추가
3. 저장소 Secrets에 `NOTION_TOKEN` 등록 (DB 변경 시 `NOTION_DATABASE_ID` 추가)

> 독서 기록(`/reading/`)의 Notion 연동과는 별개 DB·워크플로입니다.

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
