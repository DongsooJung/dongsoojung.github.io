# iOS 배포 준비 (멤버십 대기)

Apple Developer Program 1년 멤버십이 승인되기 전에는 App Store Connect에 앱을 만들거나 IPA를 올릴 수 없습니다. 승인 당일에 붙여 넣을 문구는 `listing-ko.md`, 개인정보 영양 라벨은 `app-privacy.md`입니다. 둘 다 `../play-console-answers.md`와 `../store-listing-ko.md`를 따릅니다.

## 지금 되는 설치

iPhone·iPad는 Safari에서 `https://stargateedu.co.kr/`을 연 뒤 공유 → 홈 화면에 추가합니다. 포털 첫 화면(한국어·영어·일본어·중국어)에 `apple-mobile-web-app-capable`이 있으므로 홈 화면 아이콘은 주소창 없이 열립니다. 아이콘은 `/assets/icons/apple-touch-icon.png`(180×180)입니다.

이 경로는 개발자 계정, 인증서, Team ID가 필요 없습니다.

## 승인 뒤에 등록할 값

| 항목 | 값 |
|---|---|
| 번들 ID | `kr.co.stargateedu.app` |
| SKU | `stargate-portal` |
| 기본 언어 | 한국어 |
| 카테고리 | 교육 |
| 가격 | 무료 |
| 개인정보처리방침 | `https://stargateedu.co.kr/privacy.html` |
| 지원 URL | `https://stargateedu.co.kr/stargate-app/` |
| 마케팅 URL | `https://stargateedu.co.kr/` |
| 연령 | 콘텐츠 설문은 낮지만, 사이트 전체를 여는 앱은 제한 없는 웹 접근으로 17+가 됩니다. 아동용으로 표시하지 않습니다 |

`www.stargateedu.co.kr`은 apex로 301 이동하므로 지원 URL과 Associated Domains에 넣지 않습니다.

## App Store에 바로 내지 않는 이유

Android 앱은 Trusted Web Activity라서 Play가 웹 포털 포장을 허용합니다. Apple 심사 지침 4.2는 웹사이트를 WebView로만 감싼 앱을 최소 기능 미달로 거절하는 경우가 많습니다. 멤버십이 살아도 사이트 전체를 띄우는 껍데기 IPA는 제출하지 않습니다.

승인 뒤 제출하려면 포털에 없는 iOS 기능이 바이너리에 있어야 합니다. 예시는 오프라인 첫 화면, 홈 화면에서 바로 여는 KOI·상담 바로가기, 공유 시트입니다. Team ID가 생긴 뒤에만 `apple-app-site-association`을 배포합니다. Team ID 없는 파일을 `.well-known`에 올리면 주소 연결이 실패합니다.

## 승인 당일 순서

1. developer.apple.com에서 멤버십 활성과 Team ID를 확인합니다.
2. 번들 ID `kr.co.stargateedu.app`를 등록합니다.
3. App Store Connect에 앱을 만들고 `listing-ko.md`, `app-privacy.md`를 넣습니다.
4. 6.7인치(1290×2796)와 6.5인치(1284×2778) 스크린샷을 iPhone Safari 또는 시뮬레이터에서 캡처합니다. Play용 1080×1920은 크기가 맞지 않습니다.
5. 1024×1024 아이콘은 현재 512 원본을 그대로 늘리지 않고, 같은 마크를 1024로 다시 내보냅니다. 알파 채널은 없습니다.
6. 4.2를 넘기는 네이티브 기능이 들어간 빌드만 심사에 올립니다.
