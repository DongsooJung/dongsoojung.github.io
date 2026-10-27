# 별의문 사고력 수학 · 토스 미니앱

「별의문 사고력 수학」을 앱인토스(토스 미니앱) WebView로 출시하기 위한 저장소입니다.

## 시작

Node.js 24 이상이 필요합니다.

```bash
npm install
npm run dev
```

Cursor에서 폴더를 열면 `.cursor/rules/apps-in-toss.mdc`가 자동 적용됩니다.
작업 순서와 붙여 넣을 프롬프트는 `TASKS.md`에 있습니다.

## 구조

```
index.html                 화면 뼈대 (핀치 줌 비활성화 viewport 포함)
src/app.js                 렌더링·이벤트
src/problems.js            문제 27개 (6개 영역 × 3단계 난이도, 정답 검산 완료)
src/storage.js             저장소 어댑터 (토스 Storage API / 로컬 개발 시 localStorage)
src/style.css              라이트 단일 테마
apps-in-toss.config.ts     앱인토스 설정 (appName은 콘솔 등록값으로 교체)
supabase/migrations/       3단계 동기화용 테이블
.cursor/rules/             출시 규칙 (항상 적용)
.cursor/mcp.json           앱인토스 콘솔 MCP
```

## 빌드·출시

```bash
npm run build   # dist + stargate-thinking-math.ait
```

콘솔 업로드 → 토스 앱 QR 테스트 → 검수 요청 → 출시.
