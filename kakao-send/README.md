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
