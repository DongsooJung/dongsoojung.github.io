# 토스 미니앱 전환 작업표

Cursor에서 단계별로 아래 프롬프트를 Agent 창에 붙여 넣어 진행합니다.
각 단계가 끝나면 `npm run build`가 통과하는지 확인하고 다음 단계로 넘어갑니다.

---

## 완료된 것 (이 패키지에 반영됨)

- [x] 단일 HTML → Vite 프로젝트로 분리 (`index.html`, `src/app.js`, `src/problems.js`, `src/style.css`)
- [x] 다크 모드·테마 토글 제거, 라이트 단일
- [x] 핀치 줌 비활성화 (viewport meta)
- [x] localStorage → 앱인토스 `Storage` API 어댑터 (`src/storage.js`, 로컬 개발 시 localStorage 대체, 400ms 디바운스)
- [x] 부제 문구를 "아이와 함께 푸는 사고력 수학"으로 변경
- [x] `apps-in-toss.config.ts` (토스 내비게이션 바 라이트·뒤로가기, 바운스·당겨서 새로고침 끔)
- [x] `.cursor/rules`, `.cursor/mcp.json`
- [x] `npm run build` → `stargate-thinking-math.ait` 생성 확인 (SDK 3.9.0, Vite 6)

---

## 0단계. 준비 (사람이 직접)

1. 앱인토스 콘솔 가입 → 워크스페이스 생성 (사업자: 주식회사 별의문)
   - https://apps-in-toss.toss.im/
2. 미니앱 등록: 이름 「별의문 사고력 수학」, 카테고리 교육
3. 콘솔에 등록한 앱 영문 키를 `apps-in-toss.config.ts`의 `appName`에 입력
4. Cursor 설정 → Indexing & Docs → Add Doc
   - `https://developers-apps-in-toss.toss.im/llms.txt`
   - 이름: `appsintoss` (프롬프트에서 `@appsintoss`로 호출)
5. Cursor 설정 → MCP → `apps-in-toss-console` 켜고 로그인
   - 로그인 창이 안 뜨면 이 MCP는 건너뛰고 콘솔 웹에서 직접 진행해도 됩니다.

```bash
node -v          # v24 이상 필요 (번들 포맷 패키지 요구사항)
npm install
npm run dev      # 로컬 미리보기
npm run build    # dist + stargate-thinking-math.ait
```

`npx ait init`은 다시 돌리지 않아도 됩니다. 설정 파일이 이미 들어 있습니다.

---

## 1단계. 실행 확인

```
@appsintoss npm run dev로 띄운 화면에서 문제 열기 → 힌트 → 정답 → 새로고침 후 진도 유지까지
동작을 점검하고, 콘솔 오류가 있으면 고쳐줘. 기능과 문제 데이터는 바꾸지 마.
```

---

## 2단계. 내비게이션·뒤로가기

```
@appsintoss 내비게이션 규칙을 맞춰줘.
- 풀이 시트(#sheet)가 열린 상태에서 안드로이드 백버튼·토스 뒤로가기를 누르면 시트만 닫혀야 해.
- 첫 화면에서 뒤로가기를 누르면 미니앱이 종료돼야 해.
- 자체 닫기 버튼(×)은 시트 안에만 두고, 토스 내비게이션 바 뒤로가기와 겹치지 않게 해.
- 공식 문서의 화면 이벤트·뒤로가기 처리 API를 먼저 찾아보고 그걸로 구현해줘.
```

---

## 3단계. 사용자 식별키 + 기기 변경 후 기록 유지

```
@appsintoss 기기를 바꿔도 진도가 유지되게 해줘.
- User.getAnonymousKey()로 hash를 받아 사용자 키로 써.
- src/storage.js의 load/save만 바꿔. app.js는 건드리지 마.
- 저장 순서: 앱인토스 Storage(즉시) → Supabase(백그라운드 동기화). 오프라인이면 Storage만.
- Supabase 테이블은 supabase/migrations/001_progress.sql을 써.
- 클라이언트가 hash만으로 남의 기록을 읽고 쓸 수 없게 해야 해.
  공식 문서 "사용자 식별키 인증 코드 발급"(createAnonymousKeyAuthCode)을 확인해서,
  Supabase Edge Function이 인증 코드를 서버에서 교환해 사용자를 확인한 뒤에만 읽기·쓰기하도록 설계해줘.
- Supabase URL·키는 .env로 빼고 .env.example만 커밋해.
```

---

## 4단계. 수익화 (리워드 광고)

```
@appsintoss 보상형 광고를 붙여줘.
- 힌트 3개를 다 쓴 뒤 "광고 보고 풀이 미리 보기" 버튼을 보여줘. 누르기 전에는 광고를 띄우지 마.
- 광고는 화면 진입 시 미리 로딩하고, 재생 시점에 실시간 로딩하지 마.
- 끝까지 시청했을 때만 풀이를 열어줘. 중간에 닫으면 아무 일도 없어야 해.
- 콘솔 광고 ID는 .env로 빼고, 개발 중에는 테스트 광고 ID를 써.
```

---

## 5단계. 출시 전 점검

```
@appsintoss 비게임 출시 가이드(checklist/app-nongame.md) 항목을 하나씩 이 코드와 대조해서
통과/미통과/해당없음 표로 정리해줘. 미통과 항목은 바로 고쳐줘.
```

그다음:

```bash
npm run build    # .ait 번들 생성
```

- 콘솔에 번들 업로드 → QR로 토스 앱 실기기 테스트 (워크스페이스 멤버·토스 로그인 상태 필요)
- 테스트 완료 후 검수 요청 (영업일 2~3일)
- 승인 후 콘솔에서 '출시하기'

---

## 열려 있는 결정

- [ ] 이용 연령: 콘솔 등록 단계에서 연령 정책 확인 후 문구·대상 확정
- [ ] 문제 수 확장: 현재 27문제. 출시 전 최소 몇 문제로 갈지
- [ ] 인앱 결제(문제 팩) 도입 여부: 도입 시 사업자 정보·정산 등록 필요
