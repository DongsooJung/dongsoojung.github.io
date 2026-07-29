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
