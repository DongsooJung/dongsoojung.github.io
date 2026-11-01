# 클로드에서 이어서 하기

저장소 루트가 아니라 이 폴더가 「별의문 스타게이트」 토스 미니앱이다. 포털 페이지, `app/twa-manifest.json`, Play 설치 안내는 고치지 않는다.

스타게이트 Android 앱은 `stargateedu.co.kr`을 여는 TWA다. 앱인토스는 자사 도메인을 웹뷰로 감싸는 구성을 받지 않는다. 그래서 포털 전체를 옮기지 않았고, 정보올림피아드 학습 경로와 교육용 연습만 번들에 넣었다.

## 이미 된 일

- Vite 6 + `@apps-in-toss/web-framework` 3.9.0. React로 바꾸지 않는다.
- 학습 경로 12개와 연습 3개는 `src/content.js`에 있다. 정답은 `src/logic.test.mjs`와 맞다. 공식 기출 원문은 넣지 않았다.
- 라이트 모드만 사용한다. 핀치 줌은 꺼 두었다. `index.html`은 `noindex`다.
- 기록은 `src/storage.js`다. 토스 앱에서는 Storage API, `npm run dev`에서는 localStorage. 글 입력은 400ms, 체크와 채점은 즉시 1회 저장한다.
- 문제 시트가 열려 있을 때만 `graniteEvent`의 `backEvent`를 구독해 시트를 닫는다. 구독을 풀면 첫 화면의 뒤로가기는 토스 기본 동작으로 미니앱이 종료된다. 실기기에서 이 동작은 아직 확인하지 않았다.
- 풀이만 보기는 맞힌 기록에 넣지 않는다.
- 자사 도메인, Play 스토어, 메일, iframe, `location` 이동, 다크 모드는 번들 소스에 없다. `check.mjs`가 막는다.
- 로컬에서 `npm test` 5개와 `check.mjs`가 통과했다. `npm run build`로 `stargate-edu.ait`가 만들어진 것까지 확인했다. 그 파일은 Git에 없다. 콘솔 업로드와 토스 앱 QR 테스트는 하지 않았다.

## 콘솔에 넣을 값

appName은 한 번 정하면 바꿀 수 없다. `apps-in-toss.config.ts`와 같은 문자열을 쓴다.

- 앱 이름: 별의문 스타게이트
- 영문명: Stargate Edu
- appName: `stargate-edu`
- 유형: 비게임
- 카테고리: 교육
- 제작자 이름: 별의문
- 워크스페이스: 주식회사 별의문. 사업자당 1개.

사고력 수학 미니앱의 appName `stargate-thinking-math`와 섞지 않는다.

## 첫 응답에서 할 일

1. 이 폴더의 `.mcp.json`에 있는 `apps-in-toss-console`을 승인한다. Cursor용 주소만 있는 파일은 `.cursor/mcp.json`이다.
2. 토스 비즈니스 로그인(본인 명의 토스 앱, 만 19세 이상)을 끝낸다. 로그인 창이 없으면 이 폴더에서 다음을 실행하라고 안내한다.

```bash
claude mcp add apps-in-toss-console --transport http https://mcp.toss.im/adapters/apps-in-toss-console/mcp --client-id mcp-gateway
```

3. `workspace_list`로 워크스페이스를 확인한다. 없으면 위 이름으로 만든다.
4. 미니앱이 없으면 위 값으로 `miniapp_create` 한다. appName을 다른 문자열로 바꾸지 않는다.
5. Node.js 24 이상에서 `npm install`, `npm test`, `npm run build`를 통과시킨 뒤 `npx ait deploy`로 올린다. API 키는 `ait token add`로 이 사용자 홈에만 두고, 저장소와 채팅에 남기지 않는다.
6. 테스트 스킴이 나오면 그 값을 알려 준다. 검수 요청은 토스 앱에서 한 번 테스트한 뒤에만 한다.

## 그다음

`TASKS.md`의 실기기 뒤로가기, 사용자 식별키 동기화, 리워드 광고, 출시 체크리스트 순서다. 각 단계 뒤에 `npm test`와 `npm run build`가 통과해야 한다.

## 출시 규칙

- 콘텐츠는 번들 안에서만 그린다. `stargateedu.co.kr`로 보내는 링크, iframe, `location` 이동, `history` 조작을 넣지 않는다.
- SSR, `eval`, 원격 스크립트 실행을 넣지 않는다.
- 다크 모드와 테마 토글을 다시 넣지 않는다.
- 자사 로그인과 토스페이 외 결제를 넣지 않는다.
- 저장 방식은 `src/storage.js`의 `load` / `save` / `flush`만 바꾼다.
- 상세 규칙은 `.cursor/rules/apps-in-toss.mdc`와 같다.
