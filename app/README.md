# Stargate — Google Play 앱 빌드 가이드 (TWA)

`stargateedu.co.kr` 홈페이지를 그대로 여는 **Trusted Web Activity(TWA)** 앱입니다.
이 폴더에는 [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) 설정 파일(`twa-manifest.json`)만 버전 관리하고,
Gradle 프로젝트·APK/AAB·서명키는 로컬에서 생성합니다(`.gitignore` 처리됨).

## 0. 사전 준비

- Node.js 18+ 설치
- 사이트가 배포되어 `https://stargateedu.co.kr/manifest.webmanifest` 가 200으로 열리는지 확인
- Bubblewrap 설치: `npm i -g @bubblewrap/cli`
  (첫 실행 시 JDK 17과 Android SDK를 자동으로 내려받을지 물어봅니다 — Yes 권장)

## 1. 서명키(업로드 키) 생성 — 최초 1회

```bash
cd app
keytool -genkeypair -v \
  -keystore stargate-upload.keystore \
  -alias stargate \
  -keyalg RSA -keysize 2048 -validity 10000
```

> ⚠️ **`stargate-upload.keystore`와 비밀번호는 절대 커밋하지 마세요.**
> 이 저장소는 루트가 그대로 공개 서빙됩니다. 키는 비밀번호 관리자/클라우드 비공개 저장소에 백업하세요.

## 2. 앱 빌드

```bash
cd app
bubblewrap build   # twa-manifest.json을 읽어 Gradle 프로젝트 생성 + 빌드
```

산출물:
- `app-release-signed.apk` — 실기기 설치 테스트용 (`adb install app-release-signed.apk`)
- `app-release-bundle.aab` — Play Console 업로드용

버전 올릴 때: `twa-manifest.json`의 `appVersionCode`(+1)와 `appVersionName` 수정 후 다시 `bubblewrap build`.

## 3. Digital Asset Links 지문 등록 (주소창 제거)

앱과 사이트가 같은 소유자임을 증명해야 앱 상단에 브라우저 주소창이 뜨지 않습니다.

1. 업로드 키 SHA-256 지문 확인:
   ```bash
   keytool -list -v -keystore stargate-upload.keystore -alias stargate | grep SHA256
   ```
2. 저장소 루트 `.well-known/assetlinks.json`의
   `REPLACE_WITH_UPLOAD_KEY_SHA256_FINGERPRINT` 를 위 지문으로 교체 후 커밋·푸시.
3. **Play App Signing 사용 시(권장, 기본값)**: 첫 업로드 후
   Play Console → 설정 → 앱 서명 페이지의 **앱 서명 키 SHA-256 지문**을 복사해
   `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` 자리에 넣으세요. 지문은 2개 병기 가능합니다.
4. 검증: [Statement List Generator & Tester](https://developers.google.com/digital-asset-links/tools/generator)
   에 `stargateedu.co.kr` + `kr.co.stargateedu.app` + 지문 입력 → 초록불 확인.

## 4. Google Play Console 배포

1. [Play Console](https://play.google.com/console) 개발자 계정 등록 ($25, 1회) + 본인 인증
   - ⚠️ 2023-11 이후 생성한 **개인 계정**은 프로덕션 공개 전
     **비공개 테스트: 테스터 12명 × 14일 연속** 요건이 있습니다.
2. 앱 만들기: 이름 `Stargate`, 기본 언어 한국어, 유형 앱, 무료
3. 대시보드 설문 작성:
   - 개인정보처리방침 URL: `https://stargateedu.co.kr/privacy.html`
   - 데이터 보안: 수집·공유하는 데이터 없음
   - 콘텐츠 등급 설문, 타겟층, 광고 없음
4. 스토어 등록정보:
   - 앱 아이콘 512×512: `assets/icons/icon-512.png` 사용 가능
   - 피처 그래픽 1024×500, 휴대전화 스크린샷 2장 이상 (실기기 캡처)
   - 짧은 설명(80자) / 전체 설명(4000자)
5. 테스트 트랙에 `app-release-bundle.aab` 업로드 → 내부 테스트 → (개인 계정: 비공개 테스트 14일) → 프로덕션 심사 제출

## 5. 기기 테스트 체크리스트

- [ ] 앱 실행 시 홈페이지가 **주소창 없이** 풀스크린으로 열린다 (assetlinks 반영 후)
- [ ] 서브페이지 이동·뒤로가기 정상 동작
- [ ] 비행기 모드에서 오프라인 안내 페이지(`offline.html`) 표시
- [ ] 스플래시 화면 배경색(#0b1020)과 아이콘 정상 표시
