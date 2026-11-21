# OneNote · Notion 상태판

웹으로 쓰는 **Microsoft OneNote**와 **Notion**의 상태를 한 화면에서 점검하는 웹앱입니다.

## 기능

- Notion 공식 상태 페이지(`notion-status.com`) 요약·구성 요소 표시
- OneNote / Notion 웹·API 엔드포인트 도달성·지연(ms) 프로브
- 60초 자동 갱신, 최근 점검 기록(localStorage)
- `/api/service-status` 프록시 우선, 실패 시 브라우저 폴백(Notion 공식 상태)

## 경로

| 경로 | 설명 |
|------|------|
| `/onenote-notion-status/` | 대시보드 |
| `/api/service-status` | 상태 집계 JSON API |

## 로컬 확인

```bash
# API 스모크 (Node 18+)
node -e "import('./api/service-status.js').then(m => m.default({method:'GET',query:{}}, {setHeader(){}, status(c){this.c=c;return this}, json(d){console.log(JSON.stringify(d,null,2))}, end(){}}))"
```

브라우저에서 `onenote-notion-status/index.html`을 열거나, Vercel/정적 서버로 루트를 서빙한 뒤 `/onenote-notion-status/`로 접속합니다.

## 한계

- OneNote의 테넌트별 Microsoft 365 Service Health는 Graph 인증이 필요해, 공개 웹 엔드포인트 도달성으로 추정합니다.
- 계정·노트북·페이지 내용 등 개인 워크스페이스 내부 상태는 조회하지 않습니다.


## 공개 원문·표시 범위 대조 · 2026-11-20

Notion 제공자 갱신(`page.updated_at`)과 이번 조회 시작을 별도로 표시합니다. 현재 응답의 비그룹 구성 요소 19개 전체를 표시하며 기존 12개 제한을 제거했습니다. Notion 전체 배지는 공식 `indicator`만 반영하고, 공개 응답 도달성·지연은 별도 표시합니다. 401/403·CORS·시간 초과를 정상 서비스나 실제 장애로 단정하지 않습니다. 지연 2,500ms는 화면 표시 기준이며 SLA 통계가 아닙니다.

`/api/service-status`는 현재 포털에서 404이므로 브라우저 폴백을 사용합니다. 프록시 소스는 `implementationVersion=20261120-scope-v2`로 보완했지만 실제 백엔드 배포·연결을 완료한 것은 아닙니다. Graph 테넌트 상태에는 조직용 `ServiceHealth.Read.All`이 필요하며 개인 Microsoft 계정은 지원하지 않습니다. 개인 노트·페이지·워크스페이스·동기화는 조회하지 않습니다.

브라우저 폴백은 Notion 공식 JSON을 한 번 받아 상태와 지연을 함께 계산합니다. 요청별 10초 시간 제한, 60초 갱신, 최대 12회 로컬 기록을 유지합니다. 이전 v1 기록은 해석이 달라 v2 기록과 합치지 않고 원래 키에 보존합니다. 과거 월간 가용률이나 서비스 SLA를 계산한 데이터가 아닙니다.
