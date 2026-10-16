# 방문자 게시판 운영

- 공개 화면: `/board/` · 관리 화면: `/admin/board/` (기존 Cloudflare Access 인증)
- 대표/www 도메인의 정적 화면은 기존 `stargate.stargate8225.workers.dev`의 같은 게시판 경로로 이동한다. API 요청과 관리자 인증을 Worker와 같은 출처에서 처리한다.
- Firebase: `planning-with-ai-518df` · 데이터: 기본 Firestore의 `visitorPosts`
- Cloudflare Workers가 Firebase ID 토큰을 Auth REST API로 확인하고 서비스 계정 OAuth 토큰으로 Firestore REST API를 호출한다.
- 누구나 공개 글을 읽고, Google 로그인한 사용자가 자기 글만 수정·삭제한다. 게시글에는 닉네임과 작성자 UID를 포함하고 이메일은 저장하지 않는다. Firebase Authentication에는 Google 이메일·기본 프로필이 저장된다.
- 글 등록·수정마다 Turnstile 서버 검증을 수행한다. 새 글은 UID별 60초 간격으로 제한한다.
- 관리자는 답변을 작성하거나 글을 삭제한다. 수정·삭제는 Firestore updateTime 사전조건을 사용한다.
- 첨부파일, 방문자 댓글, 비밀글, 공지 고정은 첫 버전에 포함하지 않는다. 모든 글은 공개된다.

## 연결 설정

1. Firebase Authentication에서 Google 제공업체를 활성화하고 승인 도메인에 `stargateedu.co.kr`, `www.stargateedu.co.kr`, 필요 시 `stargate.stargate8225.workers.dev`를 추가한다.
2. Firestore 기본 데이터베이스를 준비한다. 기존 앱의 규칙을 보존하면서 `cloudflare/board.firestore.rules`를 병합한다. Firestore 규칙은 허용 조건이 OR로 합쳐지므로, 이 컬렉션에 적용되는 기존 포괄 허용 규칙이 있다면 반드시 범위를 제한해야 한다. 익명 로그인 허용 여부와 무관하게 게시판 컬렉션의 브라우저 직접 접근은 차단한다.
3. 전용 서버 서비스 계정에 `roles/datastore.user` 권한을 부여한다. 이 IAM 권한은 게시판 컬렉션 외의 데이터에도 접근 가능하므로 기존 Firebase Admin SDK 계정의 넓은 권한을 재사용하지 않는다. 필요 시 별도 Firebase 프로젝트로 격리한다.
4. 서비스 계정 JSON은 `FIREBASE_SERVICE_ACCOUNT` Cloudflare secret으로 넣는다. 키 파일을 Git이나 정적 배포 디렉터리에 넣지 않는다.
5. Turnstile 위젯의 허용 호스트에 실제 서비스 도메인을 등록한다. 공개 site key는 `TURNSTILE_SITE_KEY` 변수, secret key는 `TURNSTILE_SECRET_KEY` secret으로 저장한다.
6. `FIREBASE_PROJECT_ID`, `FIREBASE_API_KEY`는 `wrangler.jsonc`에 정의한다. Firebase 웹 API 키는 클라이언트 구성값이며 서비스 계정 키와 다르다. API 제한을 적용할 경우 Identity Toolkit API와 Secure Token API를 허용한다.

필수 값이 하나라도 빠지면 `/api/board/config`는 `ready: false`를 반환하고 쓰기·저장을 차단한다. 설정값 존재 확인만으로 실제 연결 성공을 의미하지 않는다.

## 배포와 검증

기존 `.github/workflows/cloudflare-workers.yml` 배포 경로를 사용한다. 다른 호스팅으로 새 사이트를 생성하지 않는다.

```sh
node --test tests/cloudflare-board.test.mjs tests/cloudflare-access.test.mjs tests/cloudflare-service-worker.test.mjs tests/cloudflare-static.test.mjs
node scripts/build-cloudflare-static.mjs
```

정적 빌드는 Git에 등록된 파일만 포함한다. `board/`와 `admin/board/`가 포함되고 `cloudflare/` 서버 소스가 빠지는지 확인한다. 실제 배포 후 로그인 → 등록 → 목록/상세 → 수정 → 다른 사용자 수정 거부 → 관리자 답변 → 삭제 흐름을 확인한다. 개인정보가 없는 명시적인 검증 글만 사용한다.

## 제한과 운영

실시간 전체 목록 리스너 대신 20개 단위 페이지 조회를 사용한다. 최신 목록은 재방문/새로고침으로 확인한다. 본문은 `textContent`로 출력해 입력 HTML을 실행하지 않는다. 백업·신고·복구 기능은 별도 운영 과제이며 삭제는 영구 삭제다. 공개 조회 트래픽과 인증 실패 트래픽은 Cloudflare WAF에서 추가 제어할 수 있다.

## 2026-10-16 연결 상태

- Firebase Google 로그인을 활성화하고 대표 도메인, www 도메인, 기존 workers.dev 도메인을 승인했다.
- 기존 기본 Firestore 데이터베이스는 `nam5`에 있다. 새 데이터베이스를 생성하지 않았다.
- 기존 규칙의 허용 기한은 2026-03-26으로 만료되어 현재 클라이언트 직접 접근은 차단된다. 기존 규칙은 수정하지 않았다. 운영 전에 게시판 컬렉션의 명시적인 접근 차단을 확인해야 한다.
- `stargate-visitor-board` 서버 계정과 Cloud Datastore 사용자 역할을 사용한다. Chrome 콘솔에서 서버 키 발급을 완료했고 `FIREBASE_SERVICE_ACCOUNT` Worker secret에 암호화 저장했다.
- `stargate-homepage-inquiry` 관리형 Turnstile 위젯의 공개 키는 `wrangler.jsonc`에 선언하고 비밀 키는 `TURNSTILE_SECRET_KEY` Worker secret으로 저장했다. 허용 호스트는 `stargateedu.co.kr`, `stargate.stargate8225.workers.dev`다.
- 운영 `/api/board/config`의 `ready: true`, `/api/board`의 HTTP 200과 실제 Firestore 목록 조회를 확인했다. Google 로그인·글쓰기 버튼이 활성화됐다.
- 비공개 `_boardDiagnostics` 컬렉션에서 서버 인증→저장→조회→삭제를 검증하고 테스트 문서를 정리했다. 공개 테스트 글은 작성하지 않았다. 실제 사용자 Google 로그인→Turnstile 검증→공개 글 등록 흐름은 직접 검증하지 않았다.
