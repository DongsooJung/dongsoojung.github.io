# 하루 견적서 · Quote Maker

프리랜서·소상공인용 PDF 견적서 생성기.

- Live: https://stargateedu.co.kr/quote-maker/
- Expo Go 런치(QR): https://stargateedu.co.kr/quote-maker/expo.html
- Expo Snack: https://snack.expo.dev/klkKl3jQHIjeBxmw_WSeW (`quote-maker-app/`)
- 스택: HTML / CSS / JS + html2pdf.js (CDN)
- 폰트: 포털과 동일 (`Pretendard` → `Apple SD Gothic Neo` 폴백, Google Fonts 미사용)
- 배포: GitHub Pages (`main` 루트) + Expo Snack (Expo Go)

## 기능

- 발행자·고객·항목 입력 → A4 실시간 미리보기
- 공급가·부가세(별도/포함/없음)·합계 자동 계산
- PDF 다운로드
- **FREE**: 워터마크 + 하루 3회 (`localStorage`)
- **PRO**: 워터마크 제거 · 로고 · 무제한 (라이선스 키)

## 수익화 설정

`quote-maker/index.html` 안의 상수:

```js
const PAY_URL = 'https://gumroad.com/l/hello'; // ← 실제 Gumroad/토스 링크로 교체
```

데모 키: `HQ-DEMO-PRO-2026`  
판매용 예시 키: `HQ-STAR-GATE-7D1C`, `HQ-SELL-2026-7606`

체크섬 키 형식: `HQ-XXXX-XXXX-ABCD`  
(앞 8글자 기반 간단 체크섬 — 구매자에게 키를 하나씩 발급)

## 로컬 확인

브라우저에서 `quote-maker/index.html`을 열거나, 사이트 루트에서 정적 서버로 확인합니다.
