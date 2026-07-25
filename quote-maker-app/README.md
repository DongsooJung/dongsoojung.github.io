# 하루 견적서 · Expo Go

웹 버전(`../quote-maker`)과 같은 Freemium PDF 견적서를 Expo Go에서 실행합니다.

## Expo Go로 바로 열기

**런치 페이지(QR·딥링크):** https://stargateedu.co.kr/quote-maker/expo.html

1. 폰에 [Expo Go](https://expo.dev/go) 설치  
2. 런치 페이지 QR 스캔, 또는 Snack 버튼 탭  

배포 메타데이터:

- [`expo-go-deploy.json`](./expo-go-deploy.json)
- 웹 동기화본: [`../quote-maker/expo-go-deploy.json`](../quote-maker/expo-go-deploy.json)

Snack을 다시 올리려면:

```bash
cd quote-maker-app
npm run publish:expo-go
```

`main`에 `App.tsx`가 푸시되면 GitHub Actions가 Snack을 재게시하고 메타데이터를 커밋합니다.

## 로컬 개발 (SDK 57)

```bash
cd quote-maker-app
npm install
npx expo start
```

- 같은 Wi-Fi에서 Expo Go로 QR 스캔
- 터널: `npx expo start --tunnel`

## 데모 Pro 키

`HQ-DEMO-PRO-2026`

## EAS (스토어/업데이트 채널)

Expo 계정 토큰(`EXPO_TOKEN`)이 있으면:

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli update --branch production --message "quote-maker"
```

## 웹 버전

https://stargateedu.co.kr/quote-maker/
