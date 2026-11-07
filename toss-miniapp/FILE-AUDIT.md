# 토스 미니앱 전환 — 파일 단위 판정

이어서 작업하는 프로젝트는 저장소 루트의 `stargate-thinking-math-toss/`입니다. Vite와 앱인토스 SDK 3.9.0으로 문제 27개를 묶은 초안이며, 아래 `toss-miniapp/thinking-math/`는 아카이브 14문항으로 만든 이전 정적 초안입니다.



기준: 앱인토스 비게임 출시 가이드(자사 도메인 렌더링 금지, CSR/SSG만 허용, 라이트 모드, 토스 로그인·토스페이, 재접속 후 데이터 유지). 이 문서는 `DongsooJung/dongsoojung.github.io`의 `main` 작업 트리를 직접 연 결과다. 포털에 이 초안을 링크하지 않는다. 검수 번들은 토스 도메인으로 올리고, 이 경로를 웹뷰로 감싸지 않는다.

## 바로 이어서 고칠 초안

`toss-miniapp/thinking-math/`

원본은 `research/math/archive/index.html`과 `research/math/archive/problems.json`의 교육용 재구성 14문항이다. 단일 HTML·클라이언트 렌더링이라는 이전 판정과 맞는 코드는 이 아카이브다. 별도 저장소의 “영재수학 앱” 단일 파일은 이 계정 공개 저장소에 없다.

초안에서 이미 뺀 것:

- `research_url`과 포털·연구 대시보드 링크
- 다크 배너(`.education-review`)와 다크 히어로
- 자체 뒤로가기. 화면 안 이동은 `문제 목록` 버튼이며 `history`를 쓰지 않는다.
- 핀치 줌. `user-scalable=no`와 `touch-action: manipulation`
- 정답을 목록에 그대로 보여주는 동작

아직 남은 것:

- 진행 기록은 `app.js`의 `PERSISTENCE = "device-local"`이다. 같은 웹뷰를 다시 열면 `localStorage`로 남는다. 기기 변경까지 유지하려면 토스 사용자 식별키와 서버 저장으로 `createProgressStore`만 교체하면 된다.
- 앱인토스 콘솔 앱 등록, 내비게이션 바, WebView 확대 금지는 콘솔 프로젝트에서 설정한다. 사업자 인앱 결제는 이 초안에 넣지 않았다.

로컬 확인:

```bash
node --test toss-miniapp/thinking-math/app.test.mjs
node toss-miniapp/thinking-math/check.mjs
python3 -m http.server 4173 --directory toss-miniapp/thinking-math
```

브라우저에서는 `http://127.0.0.1:4173/` 를 연다.

## 앱별 파일 판정

| 앱 | 판정 | 파일 |
| --- | --- | --- |
| 사고력 수학 아카이브 | 초안 작성됨. 원본 페이지는 그대로 두면 불가 | `research/math/archive/index.html`, `problems.json` |
| STARGATE MATH 서술형 AI | 통째 전환 불가 | 포털 카드만 이 저장소에 있음. 본체는 `https://stargate-math-ai.vercel.app` (Next.js, `x-powered-by: Next.js`, RSC) |
| 스타게이트 포털·TWA | 통째 전환 불가 | `index.html`, `app/twa-manifest.json`, `stargate-app/index.html` |
| 블로그 이전 페이지 | 불가 | `blog/index.html` |
| 블로그 허브 | 불가 | 다른 저장소 `DongsooJung/stargate-blog-hub` |
| 카드뉴스 | 조건부 | `cardnews/index.html` |
| 독서기록 | 조건부, 후순위 | `reading/index.html`과 `reading/*/index.html` |
| 의제 투표 `/vote/` | 이 저장소에 없음 | 비슷한 화면은 `decision/index.html`이며 투표 앱이 아님 |
| Airbnb 화면 | 조건부, 매물 링크를 빼야 함 | `airbnb/index.html` |
| 수학 채점 데모 | 지금 형태로는 불가 | `math-grader/index.html` |
| 쇼핑몰 | 불가 | `patches/stargateedu-shop/` |
| 카카오 나에게 보내기 | 불가 | `kakao-send/index.html` |

## 원본별 위반 지점

### 사고력 수학 아카이브

`research/math/archive/index.html`

- 상단 링크가 `/research/` 연구 대시보드로 나간다.
- 하단이 `problems.json`과 블로그 자동발행 설명으로 이어진다.
- `.education-review`가 어두운 배경(`#102333`)이다.
- 카드 렌더가 정답(`답 ${answer}`)을 문제와 함께 보여 준다.
- `research_url`이 있으면 별도 풀이 페이지로 이동한다.
- 진행 기록 저장이 없다.

`research/math/archive/problems.json`

- `skku-m2-01`, `bull-01`에 `research_url`이 있다. 값은 자사 경로다.

### 서술형 풀이 AI

`index.html`의 STARGATE MATH 카드는 `https://stargate-math-ai.vercel.app`로 새 창을 연다. 2026-10-27 응답 헤더는 `x-powered-by: Next.js`, `vary: rsc`다. 본문 헤더에 `https://www.stargateedu.co.kr/research/` 링크가 있다. SSR과 자사 이동이 겹쳐 웹뷰로 감쌀 수 없다. 이 Next 앱의 저장소는 이번 공개 저장소 목록에 없다.

### 포털과 TWA

`index.html`

- Google Play 설치 배너와 설치 섹션(`play.google.com`, 패키지 `kr.co.stargateedu.twa`)
- `https://stargate-homepage.vercel.app/`, `https://stargate-math-ai.vercel.app`, `https://shop.stargateedu.co.kr/`, `https://blog.stargateedu.co.kr/`
- 카카오 상담은 `/consult/`로 연결된다.

`app/README.md`, `app/twa-manifest.json`

- 앱의 본체가 `stargateedu.co.kr`을 여는 Trusted Web Activity다. 자사 도메인 렌더링 금지와 같은 구조다.

`stargate-app/index.html`

- Play 스토어, `/`, `/koi-coach/`, `/math-grader/`, `/research/`, `/strategy/`로 보내는 소개 페이지다.

`assets/site-theme.js`

- `stargate-theme` 키로 다크 모드를 `localStorage`에 저장하고 토글을 넣는다.

### 블로그

`blog/index.html`

- `meta refresh`와 `location.replace('https://blog.stargateedu.co.kr/posts/')`로 자사 블로그에 보낸다.

`DongsooJung/stargate-blog-hub`의 `math/index.html`은 연구 아카이브 URL을 글 링크에 넣는다. 링크 허브라 미니앱으로 옮기지 않는다.

### 카드뉴스

`cardnews/index.html`

- 배경 `#07101f`, `theme-color`도 어두운 색. 라이트 모드 조건에 맞지 않는다.
- Google Fonts를 외부에서 불러온다.
- 헤더가 `/`와 `/cardnews/admin/`으로 나간다.
- 뉴스레터가 `/research/`로 나간다.
- `openStory`와 `closeDialog`가 `history.replaceState`를 쓴다.
- 카드 본문은 같은 파일의 `stories` 객체에 있다. 어두운 테마와 포털 링크, 히스토리 조작을 빼고 그 객체만 남기면 정적 매거진으로 다시 검토할 수 있다.

### 독서기록

`reading/index.html`

- 기본 `color-scheme`이 dark이고 `theme-boot.js`로 테마를 바꾼다.
- 개별 도서 페이지는 알라딘 같은 외부 서점 주소를 포함한다. 예: `reading/컴퓨팅-사고력-8a7aa952/index.html`
- 600권 가까운 생성 페이지를 통째로 넣지 말고, 본문을 번들에 고정한 소수 글만 후보로 둔다.

### 투표

`/vote/` 경로는 없다. `decision/index.html`은 어두운 Decision OS이며 `https://inftexpcnfinglwlrvsj.supabase.co/functions/v1/notion-proxy`를 호출한다. 의제 투표 미니앱의 원본으로 쓰지 않는다.

### Airbnb 화면

`airbnb/index.html`

- `assets/site-theme.js`를 불러 다크 테마 토글이 붙을 수 있다. 페이지 자체 색도 `#0a0d14`다.
- 상단이 `/research/`와 `https://www.stargateedu.co.kr/`로 나간다.
- 매물 열이 `https://realty.daangn.com/articles/...`로 나간다.
- 계산기형으로 쓰려면 매물 링크와 포털 링크를 제거하고, 입력값만으로 끝나는 화면을 새로 잘라야 한다.

### 수학 채점 데모

`math-grader/index.html`

- 15행에서 `https://js.tosspayments.com/v2/standard`를 불러온다. 앱인토스 인앱 결제가 아니라 토스페이먼츠 카드 결제 위젯이다.
- 21–24행 `@media (prefers-color-scheme: dark)`
- 77행 `← STARGATE EDU`가 `/`로 나간다.
- 133–136행 `localStorage`의 `mg_uid`
- 198–212행 `payment.requestPayment({ method: "CARD" ...})`와 `successUrl`이 현재 오리진이다.
- 250행 `history.replaceState`
- 채점은 `runtime-config.js`의 외부 API를 본다. 데모 모드라 실제 채점이 아니다.

### 쇼핑몰

`patches/stargateedu-shop/api/_lib/kcp.js`와 `js/kcp-checkout.js`는 KCP 결제를 쓴다. 토스페이 외 결제라 미니앱에 넣을 수 없다.

### 카카오 나에게 보내기

`kakao-send/index.html`

- 정적 페이지는 `https://stargate-kakao-send.vercel.app/`로 보낸다.
- 앱 화면은 `/api/auth/login` 카카오 로그인을 쓴다. 토스 로그인 외 로그인은 쓸 수 없다.

## 권장 작업 순서

1. `toss-miniapp/thinking-math/`를 콘솔에 올릴 CSR 번들로 다듬고, 저장소 어댑터를 토스 사용자 키로 교체한다.
2. 카드뉴스는 `stories`만 라이트 화면으로 다시 묶는다.
3. Airbnb는 매물 링크가 없는 계산기만 따로 만들 때 검토한다.
4. 포털, TWA, 블로그 허브, 쇼핑몰, 카카오 로그인은 전환 대상에서 뺀다.
