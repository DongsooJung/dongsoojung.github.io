# 승인 후 공개까지

Apple Developer Program 멤버십이 승인된 뒤, App Store에 공개될 때까지의 순서다. 지금 저장소에 넣어 둔 파일은 승인 메일 없이 끝낸 항목이다.

## 이미 준비된 것

- [x] 한국어 이름, 부제, 홍보 문구, 키워드, 설명, 새로운 기능 (`listing-ko.md`)
- [x] App Privacy 답과 연령 설문 (`app-privacy.md`)
- [x] Connect 화면 순서와 심사 메모 (`connect-fields.md`)
- [x] 개인정보 매니페스트 `PrivacyInfo.xcprivacy`
- [x] 문서 시작 스크립트 `ios-shell.js` (Play 설치 링크, 크레딧 결제 블록, 수학 데모의 카메라 캡처를 가린다)
- [x] 앱 아이콘 `assets/icon-1024.png` (1024×1024, RGB, 알파 없음). Play 아이콘 512를 같은 마크 그대로 두 배로 만든 것이다. 모서리는 Apple이 깎으므로 미리 둥글게 넣지 않는다.
- [x] iPhone 6.9인치 스크린샷 4장, 1320×2868 (`screenshots/`)
  - `01-koi-coach.png` KOI 학습 안내
  - `02-research.png` 연구 허브
  - `03-consult.png` 상담 신청
  - `04-strategy.png` 전략 인사이트
- [x] 멤버십 전에 쓸 설치: Safari 홈 화면 추가

수학 채점 화면은 스크린샷에 넣지 않았다. 그 페이지에는 크레딧 충전 UI가 있어, 외부 결제로 읽히면 심사 지침 3.1.1에 걸린다. 설명문에는 데모라고만 적는다.

1.0은 iPhone만 올린다. iPad 스크린샷은 필요 없다. iPad는 공개 전까지 Safari 홈 화면을 쓴다.

## 승인 메일이 온 날

Mac 없이 App Store Connect와 개발자 사이트에서 한다.

- [ ] developer.apple.com에서 멤버십이 활성인지와 Team ID 10자리를 확인한다.
- [ ] 식별자에 번들 ID `kr.co.stargateedu.app`를 명시적 ID로 등록한다. Push, Associated Domains는 1.0에서 켜지 않는다.
- [ ] App Store Connect에서 신규 앱을 만든다. 값은 `connect-fields.md` 앱 정보 표다.
- [ ] 가격을 무료로, 판매 국가를 전 지역으로 저장한다.
- [ ] 앱 개인정보 보호를 `app-privacy.md`대로 게시한다. 추적에 쓰는 데이터는 없다.
- [ ] 연령 등급 설문을 제출하고 17+인지 확인한다. 아동용은 선택하지 않는다.
- [ ] 1.0 버전 페이지에 설명, 키워드, 홍보 문구, 지원 URL, 마케팅 URL, 저작권, 스크린샷 4장, 아이콘을 올린다.
- [ ] 심사 정보에 로그인 없음을 표시하고 영어 메모를 붙인다.
- [ ] 버전 출시를 수동으로 둔다.

이 단계가 끝나도 빌드가 없으면 심사를 제출할 수 없다.

## Mac에서 빌드하기

Xcode가 있는 Mac에서만 아카이브할 수 있다. 이 저장소를 연 뒤 아래를 만족하는 iPhone 앱을 만든다. 웹뷰만 전체 화면으로 띄우는 빌드는 제출하지 않는다. 심사 지침 4.2에서 웹사이트 포장으로 거절된다.

첫 화면에 심사자가 바로 볼 수 있는 기본 기능:

- [ ] 네이티브 버튼 다섯 개: 홈 `https://stargateedu.co.kr/`, KOI `/koi-coach/`, 상담 `/consult/`, 연구 `/research/`, 전략 `/strategy/`
- [ ] 네이티브 공유 버튼. 현재 페이지 URL을 공유한다.
- [ ] 비행기 모드에서 빈 오류 대신 앱 안에 포함한 `offline.html`을 보여 준다.
- [ ] `ios-shell.js`를 메인 프레임 document start에 넣는다.
- [ ] `PrivacyInfo.xcprivacy`를 앱 타깃에 넣는다.
- [ ] Info.plist에 `ITSAppUsesNonExemptEncryption` = NO
- [ ] 날씨 화면으로 갈 수 있으면 위치 사용 문구를 `connect-fields.md`대로 넣는다.
- [ ] 서명 팀은 승인된 Team ID, 번들 ID는 `kr.co.stargateedu.app`, 버전 1.0, 빌드 1
- [ ] 아이콘은 `assets/icon-1024.png`를 앱 아이콘 세트의 1024 칸에 넣는다.

제출 전에 실기기나 시뮬레이터에서 확인한다.

- [ ] 첫 화면에 Play 배지가 보이지 않는다.
- [ ] `/math-grader/`까지 이동해도 크레딧 충전 카드가 없고, 카메라가 바로 뜨지 않는다.
- [ ] 상담을 보내지 않으면 이름과 전화번호가 나가지 않는다. 보낼 때는 이름, 전화번호, 동의 체크가 있어야 한다.
- [ ] 네트워크를 끄면 오프라인 안내가 나온다.

확인이 끝나면 아카이브해서 App Store Connect에 업로드한다. 처리가 끝날 때까지 그 빌드를 버전에 고를 수 없다.

## 심사 제출과 공개

- [ ] 1.0에 처리 완료된 빌드를 선택한다.
- [ ] 빠진 항목이 없는지 버전 페이지에서 확인하고 심사를 제출한다.
- [ ] 거절이 4.2이면 웹뷰 비율을 늘리지 말고, 위 네이티브 버튼이 첫 화면에 있는지부터 고친다.
- [ ] 거절이 3.1.1이면 수학 화면의 결제 경로가 남았는지 확인한다.
- [ ] 상태가 심사 통과가 되면 제품 페이지의 이름, 스크린샷, 개인정보, 17+를 한 번 보고 수동으로 공개한다.
- [ ] 공개 URL이 `https://apps.apple.com`에서 열리면 끝이다. 이 저장소의 홈과 `/stargate-app/`에 그 링크를 추가한다.

## 공개 다음에만 하는 것

Team ID가 생기기 전에 `apple-app-site-association`을 올리면 주소 연결이 실패한다. 공개 뒤에 Team ID를 넣어 아래 파일을 `https://stargateedu.co.kr/.well-known/apple-app-site-association`에 `application/json`으로 둔다. `www`는 넣지 않는다.

```json
{
  "applinks": {
    "details": [
      {
        "appIDs": ["TEAMID.kr.co.stargateedu.app"],
        "components": [{ "/": "/*" }]
      }
    ]
  }
}
```

App Store 앱 ID가 생긴 뒤에만 홈에 `apple-itunes-app` 메타를 넣는다. 1.0에는 푸시 알림과 Associated Domains를 켜지 않는다.
