# Stargate — Google Play 스토어 등록물 (Store Listing Assets)

`app/README.md`의 4단계(스토어 등록정보) 작성을 위한 **바로 붙여넣기용 자료 모음**입니다.
아이콘·서명·AAB 빌드는 `app/README.md` 참고. 이 폴더는 등록물(그래픽·문구·설문 답변)만 담습니다.

## 폴더 구성

| 파일 | 용도 | Play Console 위치 |
|---|---|---|
| `assets/feature-graphic-1024x500.png` | 피처 그래픽 (필수) | 스토어 등록정보 → 그래픽 |
| `assets/screenshot-01-portal-1080x1920.png` | 휴대전화 스크린샷 ① 메인 포털 | 스토어 등록정보 → 휴대전화 |
| `assets/screenshot-02-dart-top100-1080x1920.png` | 스크린샷 ② DART 상위 100 대시보드 | 〃 |
| `assets/screenshot-03-court-auction-1080x1920.png` | 스크린샷 ③ 법원경매 부동산 대시보드 | 〃 |
| `assets/screenshot-04-korea-tourism-1080x1920.png` | 스크린샷 ④ 방한 관광객 통계 | 〃 |
| `listing-ko.md` | 앱 이름·짧은 설명·전체 설명 (한국어) | 스토어 등록정보 → 기본 |
| `data-safety.md` | 데이터 안전 · 콘텐츠 등급 설문 답변표 | 앱 콘텐츠 |

## 아이콘 512×512

앱 아이콘은 이미 저장소에 있습니다: `assets/icons/icon-512.png` 를 그대로 업로드하세요.

## 그래픽 규격 (참고)

- 앱 아이콘: 512×512 PNG, 32비트(알파 포함)
- 피처 그래픽: **1024×500** PNG/JPG (알파 없음) — 본 폴더 파일이 규격 충족
- 휴대전화 스크린샷: 2~8장, 세로 1080×1920(9:16) — 본 폴더 4장 제공

## 재생성 방법 (문구·색상 바꾼 뒤)

그래픽/스크린샷은 저장소 자체를 로컬 서빙해 헤드리스 Chromium으로 캡처했습니다.
소스와 캡처 스크립트가 필요하면 PR 히스토리의 `scratchpad_feature.html` /
`scratchpad_capture.mjs` 를 참고하세요(리포에는 커밋하지 않습니다).
