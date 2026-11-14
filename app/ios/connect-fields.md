# App Store Connect에 붙여 넣을 값

문구 원문은 `listing-ko.md`, 데이터 유형은 `app-privacy.md`다. 아래는 승인 뒤 화면 순서대로 넣는 값이다.

## 앱 정보

| 필드 | 값 |
|---|---|
| 이름 | 스타게이트 STARGATE: 정보올림피아드·수학 |
| 부제 | KOI·AI 수학·교육 포털 |
| 번들 ID | `kr.co.stargateedu.app` |
| SKU | `stargate-portal` |
| 기본 언어 | 한국어 |
| 기본 카테고리 | 교육 |
| 보조 카테고리 | 없음 |
| 콘텐츠 권한 | 앱에 표시되는 글과 대시보드는 주식회사 별의문이 운영하는 stargateedu.co.kr 공개 페이지다. 유료 제3자 콘텐츠를 재판매하지 않는다. |
| 연령 등급 | 설문은 `app-privacy.md`. 제한 없는 웹 접근이 예이므로 산출은 17+. 아동용으로 지정하지 않는다. |
| 가격 | 무료 |
| 앱 내 구입 | 없음 |
| 판매 국가 | Play와 같이 전 지역. 한국어가 기본이다. |
| 버전 | 1.0 |
| 저작권 | 2026 주식회사 별의문 |
| 개인정보처리방침 | `https://stargateedu.co.kr/privacy.html` |
| 지원 URL | `https://stargateedu.co.kr/stargate-app/` |
| 마케팅 URL | `https://stargateedu.co.kr/` |
| 홍보 문구 | 회원가입 없이 KOI 학습 안내, 수학 채점 화면, 1:1 상담과 공공데이터 대시보드를 엽니다. |
| 키워드 | `정보올림피아드,KOI,수학,알고리즘,코딩,대치동,상담,교육` |
| 새로운 기능 | 스타게이트 포털을 iPhone에서 엽니다. KOI 학습 안내, 수학 채점 화면 데모, 상담과 연구 대시보드를 회원가입 없이 볼 수 있습니다. |

설명 본문은 `listing-ko.md`의 설명 전체를 붙인다. `www.stargateedu.co.kr`은 넣지 않는다.

## 심사 정보

| 필드 | 값 |
|---|---|
| 로그인 필요 | 아니요 |
| 데모 계정 | 없음 |
| 연락 이름 | 정동수 |
| 전화 | 070-8027-8225 |
| 이메일 | support@stargateedu.co.kr |
| 광고 식별자 | 사용 안 함 |
| 출시 방식 | 수동. 심사 통과 후 제품 페이지를 보고 공개를 누른다. |

심사 메모:

```
No account is required. Public screens open without login.

A consultation request is optional. Sending one requires a name, phone number, and consent. Kakao and Naver buttons only fill the name. They do not create an account, and the page says the login token is not stored.

The public math screen is a demo. It does not analyze images or score answers. Version 1.0 hides the credit purchase block and does not use In-App Purchase.

The KOI problem archive is not available yet. KOI Coach is a study roadmap.

There is no advertising SDK. Coarse location is used only if the user opens the weather calendar. It is sent to Open-Meteo for that request and is not stored on our server.

Native controls on the first screen are Home, KOI, Consult, Research, and Strategy, plus Share. Airplane mode shows the bundled offline page.
```

## 암호화

빌드 설정의 Info.plist에 `ITSAppUsesNonExemptEncryption` = `NO`를 넣는다. 앱의 암호화는 HTTPS뿐이다. 업로드 때 수출 규정 질문을 다시 묻지 않는다.

## 위치 권한 문구

날씨 화면을 열 수 있으면 Info.plist의 `NSLocationWhenInUseUsageDescription`에 다음을 넣는다.

```
날씨 화면에서 현재 위치의 날씨를 조회할 때 사용합니다. 위치는 저장하지 않습니다.
```

카메라·사진 보관함 문구는 1.0에 넣지 않는다. `ios-shell.js`가 수학 데모의 카메라 캡처 속성을 제거한다.
