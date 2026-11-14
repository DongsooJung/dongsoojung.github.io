# 클로드에서 이어서 하기

이 폴더는 `DongsooJung/dongsoojung.github.io` 브랜치 `cursor/toss-thinking-math-b4f2` 안의 「별의문 사고력 수학」 토스 미니앱이다. `stargate-thinking-math`라는 저장소는 없다. 포털 페이지, `CNAME`, `.nojekyll`은 건드리지 않는다. 포털에 미니앱 링크를 넣지 않는다.

## 콘솔에 이미 있는 앱

앱은 등록되어 있다. 아래 값을 유지한다.

- 표시 이름: 별의문 사고력 수학
- appName: `stargate-thinking-math` (`apps-in-toss.config.ts`와 같음)
- 유형: 게임
- 카테고리: 게임 > 퀴즈
- 플랫폼 연령: 만 19세 이상
- GRAC: 아직 신청하지 않음

다음 행동은 이 폴더를 열고 `.mcp.json`을 승인한 뒤, 이 기존 앱만 배포하는 것이다.

## 하지 않는 일

- `miniapp_create`를 호출하지 않는다. 두 번째 미니앱을 만들지 않는다.
- 콘솔 앱 유형, 카테고리, appName을 바꾸지 않는다.
- 비게임 앱이나 교육 앱을 새로 열지 않는다.
- 사용자가 토스 지원 답변으로 허용했다고 명시하기 전에는 GRAC를 시작하지 않는다.
- API 키, 비밀번호, `~/.ait` 자격 증명을 파일, 커밋, 채팅에 넣지 않는다.
- 토큰 추가와 배포는 사용자 PC에서만 한다. 키는 채팅이 아니라 터미널 프롬프트에 입력한다.

## 이미 된 코드 작업

- Vite + `@apps-in-toss/web-framework` 3.9.0. 문제 27개는 `src/problems.js`에 있고 정답은 바꾸지 않는다.
- 라이트 모드만 사용한다. 핀치 줌은 꺼 두었다. 토스 내비게이션 바는 라이트, 뒤로가기 켜짐, 홈 버튼 꺼짐.
- 진도는 `src/storage.js`의 앱인토스 Storage API에 400ms 디바운스로 저장한다. 로컬 `npm run dev`에서는 localStorage로 바뀐다.
- Node.js 24 이상이 필요하다. `npm run build`는 `vite build && ait build`다. `ait build`를 `vite build`보다 먼저 돌리지 않는다. 결과 번들은 `stargate-thinking-math.ait`다.
- 브라우저에서 27문항, 오답, 힌트, 정답, 새로고침 후 기록 유지를 확인했다.

## 첫 응답에서 할 일

1. `.mcp.json`의 `apps-in-toss-console`을 승인한다. 파일이 없으면 아래 내용으로 복구한다. 시크릿은 넣지 않는다.

```json
{
  "mcpServers": {
    "apps-in-toss-console": {
      "type": "http",
      "url": "https://mcp.toss.im/adapters/apps-in-toss-console/mcp",
      "oauth": {
        "clientId": "mcp-gateway"
      }
    }
  }
}
```

2. 로그인이 필요하면 사용자에게 본인 명의 토스 앱(플랫폼 만 19세 이상)으로 토스 비즈니스 로그인을 끝내라고 안내한다. 로그인 창이 없으면 이 폴더에서 다음을 실행하라고 안내한다.

```bash
claude mcp add apps-in-toss-console --transport http https://mcp.toss.im/adapters/apps-in-toss-console/mcp --client-id mcp-gateway
```

3. 기존 앱 `stargate-thinking-math`만 조회한다. 생성 API는 호출하지 않는다.
4. 빌드가 필요하면 Node.js 24 이상에서 아래만 실행한다.

```bash
npm install
npm run build
```

5. 사용자에게 자기 PC에서만 아래를 실행하라고 안내한다. 키는 프롬프트에 입력하고 채팅에 붙이지 않는다.

```bash
npx ait token add
npx ait deploy -m "thinking-math 초기 검수 요청"
```

만든 번들 파일만 올릴 때는 `npx ait deploy --location ./stargate-thinking-math.ait`를 안내한다.

6. 콘솔에 남은 일은 번들 업로드와 토스앱 테스트다. 검수 요청은 실기기 테스트가 끝난 뒤에만 한다. 배포 메시지의 「검수 요청」 문구만으로 콘솔 검수를 제출하지 않는다.

## 열린 질문

아래는 아직 결정되지 않았다. 확정된 금지로 보고 배포를 멈추거나, 앱을 새로 만들거나, 유형을 바꾸지 않는다.

- 중복 앱 정책
- 교육 카테고리 수익에 국가자격이 필요한지
- 광고 사업자 등록 시점 (링크를 먼저 거는지, 5,000원 유예가 있는지)
- 광고를 미니앱 안 인앱 광고로만 둘지 (YouTube, AdSense 삽입을 쓰지 않는 방안 포함)
- 광고 운영비 약 30%는 면제되지 않는다는 안내
- 앱인토스 수수료 15%는 현재 면제라는 안내

## 그다음

`TASKS.md`의 2단계 뒤로가기, 3단계 사용자 식별키와 Supabase, 4단계 리워드 광고, 5단계 출시 점검 순서로 간다. 각 단계 뒤에 `npm run build`가 통과해야 한다. 5단계는 등록된 유형 게임 기준으로 점검한다.

## 출시 규칙

- 콘텐츠는 번들 안에서만 그린다. `stargateedu.co.kr`로 보내는 링크, iframe, `location` 이동, `history` 조작을 넣지 않는다.
- SSR, `eval`, 원격 스크립트 실행을 넣지 않는다.
- 다크 모드와 테마 토글을 다시 넣지 않는다.
- 자사 로그인과 토스페이 외 결제를 넣지 않는다.
- 저장 방식은 `src/storage.js`의 `load` / `save` / `flush`만 바꾼다.
- 상세 규칙은 `.cursor/rules/apps-in-toss.mdc`와 같다. 그 파일은 콘텐츠·기술 규칙이다. 콘솔 유형을 바꾸는 지시가 아니다.
