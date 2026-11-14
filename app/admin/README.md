# STARGATE 관리자 — Google Play 신규 등록 가이드 (TWA)

`https://stargateedu.co.kr/stargate-admin/` 을 여는 Trusted Web Activity 앱입니다.
기존 공개 앱 `kr.co.stargateedu.twa`(사이트 전체)와 별개의 앱으로 등록합니다.

| 항목 | 값 |
|---|---|
| 패키지 이름 | `kr.co.stargateedu.admin` (등록 후에는 바꿀 수 없음) |
| 시작 주소 | `/stargate-admin/#today` |
| 범위 | `https://stargateedu.co.kr/stargate-admin/` |
| 버전 | 이름 `1.4.0`, 코드 `1` |
| 업로드 키 | `app/admin/stargate-admin-upload.keystore`, 별칭 `stargate-admin` |

이 폴더에는 설정(`twa-manifest.json`)과 문서만 버전 관리합니다. Gradle 프로젝트, APK/AAB, 키스토어는 `.gitignore` 처리되어 있습니다.

## 진행 상태 (2026-11-14)

- [x] TWA 설정 파일, 스토어 문구, 콘솔 답변표 작성
- [x] 지문 스크립트가 패키지를 지정해 받도록 수정
- [ ] JDK 17, Bubblewrap 설치 (이 PC에 없음)
- [ ] 업로드 키 생성
- [ ] AAB 빌드
- [ ] `assetlinks.json`에 지문 등록
- [ ] Play Console 앱 생성, 설문, 등록정보, 제출
- [ ] 피처 그래픽 1024×500, 휴대전화 스크린샷 2장 이상

빌드와 제출은 아직 한 번도 실행하지 않았습니다.

## 1. 도구 설치

- JDK 17
- Node.js 18 이상
- `npm i -g @bubblewrap/cli` (첫 실행 때 Android SDK를 내려받습니다)

## 2. 업로드 키 생성 — 최초 1회

```bash
cd app/admin
keytool -genkeypair -v -keystore stargate-admin-upload.keystore -alias stargate-admin -keyalg RSA -keysize 2048 -validity 10000
```

키스토어와 비밀번호는 커밋하지 않습니다. 이 저장소는 루트가 공개 서빙됩니다.
잃어버리면 Google에 업로드 키 재설정을 요청해야 하므로 비밀번호 관리자와 비공개 저장소에 백업합니다.
기존 앱의 `stargate-upload.keystore`를 재사용하지 않고 앱마다 키를 따로 둡니다.

## 3. 빌드

```bash
cd app/admin
bubblewrap build
```

산출물은 `app-release-bundle.aab`(Play 업로드용)와 `app-release-signed.apk`(실기기 확인용)입니다.

## 4. Digital Asset Links 지문 등록

지문이 없으면 앱 상단에 브라우저 주소창이 표시됩니다. 같은 도메인이라 기존 `.well-known/assetlinks.json`에 패키지 항목을 추가합니다.

```bash
keytool -list -v -keystore app/admin/stargate-admin-upload.keystore -alias stargate-admin
node scripts/add-twa-fingerprint.mjs --package kr.co.stargateedu.admin "<업로드 키 SHA-256>"
```

첫 AAB를 올린 뒤 Play Console → 테스트 및 출시 → 앱 무결성 → Play 앱 서명에서 **앱 서명 키** 지문을 복사해 한 번 더 추가합니다. Play로 설치한 앱은 Google이 다시 서명하기 때문입니다.

```bash
node scripts/add-twa-fingerprint.mjs --package kr.co.stargateedu.admin "<앱 서명 키 SHA-256>"
node scripts/add-twa-fingerprint.mjs --package kr.co.stargateedu.admin --check
```

`assetlinks.json` 변경은 `main`에 병합되어 GitHub Pages에 반영돼야 효력이 있습니다.

## 5. Play Console

1. 앱 만들기: 이름 `STARGATE 관리자`, 기본 언어 한국어, 앱, 무료
2. 앱 콘텐츠 설문: [`play-console-answers.md`](play-console-answers.md)
3. 스토어 등록정보: [`store-listing-ko.md`](store-listing-ko.md)
4. AAB 업로드 후 트랙 선택
   - 내부 테스트: 심사 없이 지정한 계정(최대 100명)만 설치. 본인 기기 확인용으로 먼저 권장
   - 프로덕션: 공개 심사 제출

## 6. 공개 전에 판단할 점

- 이 앱은 로그인이 없고 기록을 기기 브라우저 저장소에만 둡니다. 기기를 바꾸면 설정 화면의 내보내기·가져오기로 옮겨야 합니다. 스토어 설명에 그대로 적었습니다.
- 사이트 전체 앱(`kr.co.stargateedu.twa`)에서도 같은 주소가 열립니다. 두 앱의 기능이 겹친다는 이유로 심사에서 문의가 올 수 있습니다(미확인).
- 웹 화면이 바뀌면 앱에도 바로 반영됩니다. 스토어에 새 버전을 올릴 일은 아이콘·이름·패키지 설정이 바뀔 때뿐입니다.

## 7. 기기 확인 목록

- [ ] 주소창 없이 전체 화면으로 열린다 (지문 반영 후)
- [ ] 작업 추가·검색·정렬이 동작하고 앱을 다시 열어도 기록이 남아 있다
- [ ] 비행기 모드에서도 화면이 열린다 (서비스 워커 캐시)
- [ ] 프로젝트 링크를 누르면 범위 밖 주소는 브라우저 탭으로 열린다
