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

버전 올릴 때: `twa-manifest.json`의 `appVersionCode`(+1)와 `appVersion`(Bubblewrap가 읽는 버전 이름)을 수정한 뒤 `bubblewrap update --skipVersionUpgrade`와 `bubblewrap build`를 실행합니다. `minSdkVersion`은 24 이상이어야 합니다.

## 3. Digital Asset Links 지문 등록 (주소창 제거)

앱과 사이트가 같은 소유자임을 증명해야 앱 상단에 브라우저 주소창이 뜨지 않습니다.

1. 업로드 키 SHA-256 지문 확인:
   ```bash
   keytool -list -v -keystore stargate-upload.keystore -alias stargate | grep SHA256
   ```
2. 저장소 루트 `.well-known/assetlinks.json`에서 `kr.co.stargateedu.twa` 항목에 업로드 키 지문이 등록되어 있는지 확인 후 커밋·푸시합니다.
3. **Play App Signing 앱 서명 키 지문 추가 (필수)**: Play로 설치된 앱은 Google이 다시 서명하므로,
   업로드 키 지문만으로는 주소창이 사라지지 않습니다. 첫 AAB 업로드 후:
   1. Play Console → 앱 선택 → **테스트 및 출시 → 앱 무결성 → Play 앱 서명 → 설정**
   2. **앱 서명 키 인증서**의 `SHA-256 인증서 지문`을 복사합니다
      (업로드 키 인증서 지문은 이미 등록된 `27:55:98:…:24:0F`와 같아야 합니다).
   3. 저장소 루트에서 실행 → 커밋·푸시:
      ```bash
      node scripts/add-twa-fingerprint.mjs "XX:XX:...:XX"   # 콜론/대소문자/"SHA256:" 접두어 상관없음
      ```
4. 검증: 배포 반영(수 분) 후 `node scripts/add-twa-fingerprint.mjs --check` → 모든 지문이 `✅ linked`이면 완료.
   Play에서 설치한 앱을 한 번 지웠다 다시 설치하거나 앱 데이터를 지워야 바뀐 결과가 적용됩니다.

## 4. Google Play Console 배포

1. [Play Console](https://play.google.com/console) 개발자 계정 등록 ($25, 1회) + 본인 인증
   - Stargate는 **법인(조직) 계정**으로 등록 → 개인 계정에만 적용되는
     "비공개 테스트 12명 × 14일" 요건이 없어 바로 프로덕션 트랙에 제출할 수 있습니다.
   - 조직 계정은 D-U-N-S 번호와 조직 인증이 필요합니다.
2. 앱 만들기: 이름 `Stargate`, 기본 언어 한국어, 유형 앱, 무료
3. 대시보드 설문 작성:
   - 개인정보처리방침 URL: `https://stargateedu.co.kr/privacy.html`
   - 데이터 보안·콘텐츠 등급·타겟층·광고 등 항목별 답: [`play-console-answers.md`](play-console-answers.md)
     (사이트의 상담 폼과 방문 통계 때문에 데이터 보안은 "수집 있음"으로 신고해야 합니다)
4. 스토어 등록정보:
   - 앱 아이콘 512×512: `assets/icons/icon-512.png` 사용 가능
   - 피처 그래픽 1024×500, 휴대전화 스크린샷 2장 이상 (실기기 캡처)
   - 짧은 설명(80자) / 전체 설명(4000자)
5. `app-release-bundle.aab` 업로드 → (선택) 내부 테스트로 실기기 확인 → 프로덕션 트랙 심사 제출
   - ⚠️ 첫 업로드 후 3번 항목의 **앱 서명 키 지문**을 `assetlinks.json`에 추가해야 Play 설치본에서 주소창이 사라집니다.

## 5. 기기 테스트 체크리스트

- [ ] 앱 실행 시 홈페이지가 **주소창 없이** 풀스크린으로 열린다 (assetlinks 반영 후)
- [ ] 서브페이지 이동·뒤로가기 정상 동작
- [ ] 비행기 모드에서 오프라인 안내 페이지(`offline.html`) 표시
- [ ] 스플래시 화면 배경색(#0b1020)과 아이콘 정상 표시
