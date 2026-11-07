# 클로드에서 이어서 하기

이 폴더가 「별의문 사고력 수학」 토스 미니앱이다. 포털 저장소의 다른 페이지는 고치지 않는다.

## 이미 된 일

- Vite + `@apps-in-toss/web-framework` 3.9.0. 문제 27개는 `src/problems.js`에 있고 정답은 바꾸지 않는다.
- 라이트 모드만 사용한다. 핀치 줌은 꺼 두었다. 토스 내비게이션 바는 라이트, 뒤로가기 켜짐, 홈 버튼 꺼짐.
- 진도는 `src/storage.js`의 앱인토스 Storage API에 400ms 디바운스로 저장한다. 로컬 `npm run dev`에서는 localStorage로 바뀐다.
- `npm run build`로 `stargate-thinking-math.ait`가 만들어지는 것까지 확인했다.
- 브라우저에서 27문항, 오답, 힌트, 정답, 새로고침 후 기록 유지를 확인했다.

## 여기서 막힌 일

앱인토스 콘솔 등록은 아직이다. Cursor에서는 콘솔 MCP 로그인이 뜨지 않았다. 이 폴더의 `.mcp.json`은 클로드 코드용이다. `type: http`와 OAuth client id `mcp-gateway`가 들어 있다.

콘솔에 넣을 값. appName은 한 번 정하면 바꿀 수 없다.

- 앱 이름: 별의문 사고력 수학
- 영문명: Byeol Math
- appName: `stargate-thinking-math` (`apps-in-toss.config.ts`와 같음)
- 유형: 비게임
- 카테고리: 교육
- 제작자 이름: 별의문
- 워크스페이스: 주식회사 별의문. 사업자당 1개.

## 첫 응답에서 할 일

1. `.mcp.json`의 `apps-in-toss-console`을 승인한다.
2. 토스 비즈니스 로그인(본인 명의 토스 앱, 만 19세 이상)을 끝낸다. 로그인 창이 없으면 이 폴더에서 다음을 실행하라고 안내한다.

```bash
claude mcp add apps-in-toss-console --transport http https://mcp.toss.im/adapters/apps-in-toss-console/mcp --client-id mcp-gateway
```

3. `workspace_list`로 워크스페이스를 확인한다. 없으면 위 이름으로 만든다.
4. 미니앱이 없으면 위 값으로 `miniapp_create` 한다. appName을 다른 문자열로 바꾸지 않는다.
5. 번들 업로드는 `npm run build` 다음 `npx ait deploy`다. API 키는 `ait token add`로 이 사용자 홈에만 두고, 저장소와 채팅 로그에 남기지 않는다.
6. 업로드 후 테스트 스킴이 나오면 그 값을 알려 준다. 검수 요청은 토스 앱에서 테스트를 한 번 끝낸 뒤에만 한다.

Node.js 24 이상이 필요하다. 빌드 명령은 `npm install` 다음 `npm run build`다.

## 그다음

`TASKS.md`의 2단계 뒤로가기, 3단계 사용자 식별키와 Supabase, 4단계 리워드 광고, 5단계 출시 체크리스트 순서로 간다. 각 단계 뒤에 `npm run build`가 통과해야 한다.

## 출시 규칙

- 콘텐츠는 번들 안에서만 그린다. `stargateedu.co.kr`로 보내는 링크, iframe, `location` 이동, `history` 조작을 넣지 않는다.
- SSR, `eval`, 원격 스크립트 실행을 넣지 않는다.
- 다크 모드와 테마 토글을 다시 넣지 않는다.
- 자사 로그인과 토스페이 외 결제를 넣지 않는다.
- 저장 방식은 `src/storage.js`의 `load` / `save` / `flush`만 바꾼다.
- 상세 규칙은 `.cursor/rules/apps-in-toss.mdc`와 같다.
