# 별의문 사고력 수학 · 토스 미니앱

「별의문 사고력 수학」 앱인토스 WebView 프로젝트다. 저장소는 `DongsooJung/dongsoojung.github.io`, 브랜치 `cursor/toss-thinking-math-b4f2`, 폴더는 `stargate-thinking-math-toss`다. `stargate-thinking-math`라는 저장소는 없다.

## 시작

Node.js 24 이상이 필요합니다.

```bash
npm install
npm run dev
```

Cursor에서 폴더를 열면 `.cursor/rules/apps-in-toss.mdc`가 자동 적용됩니다.
클로드 코드는 이 폴더의 `CLAUDE.md`를 따른다. 콘솔 앱은 이미 있다. `.mcp.json`을 승인하고 기존 앱만 배포한다. `miniapp_create`는 호출하지 않는다.
작업 순서와 붙여 넣을 프롬프트는 `TASKS.md`에 있습니다.

## 구조

```
index.html                 화면 뼈대 (핀치 줌 비활성화 viewport 포함)
src/app.js                 렌더링·이벤트
src/problems.js            문제 27개 (6개 영역 × 3단계 난이도, 정답 검산 완료)
src/storage.js             저장소 어댑터 (토스 Storage API / 로컬 개발 시 localStorage)
src/style.css              라이트 단일 테마
apps-in-toss.config.ts     appName `stargate-thinking-math` (바꾸지 않음. 유형 게임, 카테고리 게임 > 퀴즈)
supabase/migrations/       3단계 동기화용 테이블
.cursor/rules/             출시 규칙 (Cursor)
.cursor/mcp.json           콘솔 MCP 주소 (Cursor)
CLAUDE.md                  클로드 코드 이어하기
.mcp.json                  클로드 코드용 콘솔 MCP (OAuth client id 포함)
```

## 빌드·출시

```bash
npm install
npm run build   # vite build && ait build. ait build를 먼저 돌리지 않음
```

사용자 PC에서 `npx ait token add` 다음 `npx ait deploy -m "thinking-math 초기 검수 요청"`. 키는 프롬프트에 입력한다. 그다음 토스앱 테스트. 검수 요청은 실기기 테스트 뒤에만 한다.
