# 카카오톡 나에게 보내기

카카오 OAuth 2.0과 Kakao Talk Message REST API를 이용해 로그인한 사용자의
`나와의 채팅`에 텍스트 템플릿을 전송하는 Vercel 웹앱입니다.

## 보안 구조

- OAuth `state`를 HMAC으로 검증합니다.
- 액세스/리프레시 토큰은 AES-256-GCM으로 암호화한 `HttpOnly`, `Secure` 쿠키에만 저장합니다.
- 발송과 로그아웃 API는 동일 출처 요청만 허용합니다.
- REST API 키와 선택적 클라이언트 시크릿은 Vercel 환경 변수로 주입합니다.

## Vercel 환경 변수

```text
APP_ORIGIN=https://stargate-kakao-send.vercel.app
KAKAO_REDIRECT_URI=https://stargate-kakao-send.vercel.app/api/auth/callback
KAKAO_REST_API_KEY=카카오_REST_API_키
KAKAO_CLIENT_SECRET=선택_사항
KAKAO_SESSION_SECRET=32바이트_이상의_임의_비밀값
```

카카오 개발자 콘솔에는 위 `KAKAO_REDIRECT_URI`를 Redirect URI로 등록하고,
카카오톡 메시지 전송(`talk_message`) 동의항목을 사용하도록 설정해야 합니다.

텍스트 기본 템플릿은 최대 200자이며 제품 링크 관리에 등록된 도메인만 사용할 수 있습니다.
이 구현은 메시지 링크를 `https://stargateedu.co.kr/`로 고정합니다. 전송 API가 `-402`를
반환하면 사용자가 카카오 로그인 화면에서 `talk_message` 권한을 다시 동의할 수 있도록 안내합니다.

클라이언트 시크릿이 카카오 개발자 콘솔에서 활성화되어 있다면 `KAKAO_CLIENT_SECRET`을
Vercel Production 환경 변수에 반드시 추가해야 합니다. 시크릿 값은 저장소나 정적 페이지에
커밋하지 않습니다.

## 클라이언트 시크릿 오류 임시 fallback

REST OAuth 콜백이 `auth=client_secret_error`를 반환하면 정적 페이지가 Kakao Legacy
JavaScript SDK v1을 지연 로드해 로그인과 나에게 보내기를 처리합니다. 정상 REST 로그인에서는
SDK를 로드하지 않습니다.

- JavaScript 키는 브라우저용 공개 키만 사용
- `Kakao.Auth.login({ scope: 'talk_message', persistAccessToken: false })`
- 메시지 API 요청은 `data: { template_object: { ... } }` 구조
- 본문 최대 200자, 링크 `https://stargateedu.co.kr/` 고정
- SDK 토큰 또는 Kakao 원본 오류 응답을 로그에 기록하지 않음
- `-402`는 `talk_message` 추가 동의로 복구
- 로그아웃은 `Kakao.Auth.logout()`으로 SDK 토큰을 만료

카카오 콘솔에는 JavaScript SDK 도메인, 제품 링크 웹 도메인, 카카오 로그인 ON,
`talk_message` 동의항목이 필요합니다. 이 fallback은 OIDC OFF를 전제로 합니다. OIDC를 ON으로
운영한다면 로그인 scope를 `openid,talk_message`로 변경해야 합니다.

이 경로는 비밀값을 대체하기 위한 임시 복구 수단입니다. Legacy JavaScript SDK v1은
2026년 12월 31일 지원 종료되므로 그 전에 JavaScript SDK v2 `Kakao.Auth.authorize()`와
서버 인가 코드/토큰 교환 구조로 이전해야 합니다.
