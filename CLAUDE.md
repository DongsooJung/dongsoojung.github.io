# 클로드 작업 구분

포털 페이지(`index.html`, `/research/`, `/strategy/` 등)를 고칠 때는 `AGENTS.md`를 따른다. `CNAME`과 `.nojekyll`을 유지한다. 포털에 미니앱 링크를 넣지 않는다.

토스 미니앱은 저장소 `DongsooJung/dongsoojung.github.io`, 브랜치 `cursor/toss-thinking-math-b4f2`, 폴더 `stargate-thinking-math-toss/`만 다룬다. `stargate-thinking-math`라는 저장소는 없다. `toss-miniapp/`은 이전 정적 초안 기록이다.

콘솔 앱은 이미 있다. appName은 `stargate-thinking-math`, 표시 이름은 별의문 사고력 수학, 유형은 게임, 카테고리는 게임 > 퀴즈다. 두 번째 미니앱을 만들지 않는다. `miniapp_create`를 호출하지 않는다. 콘솔 앱 유형을 바꾸지 않는다.

그 폴더의 `CLAUDE.md`를 먼저 읽는다. 콘솔 연결은 그 폴더의 `.mcp.json`을 승인하는 것으로 끝낸다. 다음 작업은 기존 앱 배포뿐이다.
