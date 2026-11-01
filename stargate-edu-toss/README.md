# 별의문 스타게이트 · 토스 미니앱

스타게이트 Android 앱의 학습 기능만 앱인토스(토스 미니앱) WebView로 옮긴 프로젝트입니다.

Play 앱은 `stargateedu.co.kr`을 여는 Trusted Web Activity라서, 그 주소 그대로는 올릴 수 없습니다. 앱인토스는 자사 도메인을 웹뷰로 감싸는 구성을 받지 않습니다. 이 폴더는 포털 링크, 설치 버튼, 상담 메일, 연구 대시보드를 빼고 아래만 번들에 넣습니다.

- 입문, 중급, 실전 학습 경로 12개 체크
- 교육용으로 다시 쓴 연습 3개. 공식 기출 원문이 아닙니다.
- 체크와 풀이 기록은 앱인토스 Storage에 남고, 로컬 미리보기에서는 localStorage를 씁니다.

포털 홈에는 이 경로를 연결하지 않습니다. 검수 번들은 토스 도메인으로 올립니다.

## 시작

Node.js 24 이상이 필요합니다.

```bash
npm install
npm test
npm run dev
```

## 구조

```
index.html                 화면 뼈대. 핀치 줌 끔, 검색 제외
src/app.js                 경로, 연습, 기록, 문제 시트
src/content.js             문구와 정답
src/logic.js               친구 수, 파트너 수, 채점, 저장값 정리
src/storage.js             앱인토스 Storage. 로컬에서는 localStorage
src/style.css              라이트 단일 테마
apps-in-toss.config.ts     appName은 stargate-edu
```

## 빌드

```bash
npm run build
```

`stargate-edu.ait`가 만들어집니다. 콘솔 등록값과 `appName`이 같아야 업로드됩니다.

## 콘솔에 넣을 값

- 앱 이름: 별의문 스타게이트
- 영문명: Stargate Edu
- appName: `stargate-edu`
- 유형: 비게임
- 카테고리: 교육
- 제작자 이름: 별의문

`appName`은 한 번 정하면 바꿀 수 없습니다.
