# Google 개발자 계정 · Stargate 통합 체크리스트

계정: **jds068888@gmail.com** · 사이트: **stargateedu.co.kr** (GitHub Pages)

이 문서는 `dongsoojung.github.io` 저장소의 여러 프로젝트를 하나의 Google 개발자 계정
아래에서 **검색 노출(Search Console)** 과 **앱 배포(Play Console)** 두 축으로 정리한
실행 목록입니다. 저장소에서 이미 처리된 항목과, 계정에서 직접 해야 하는 항목을 구분했습니다.

---

## A. Google 검색 (Search Console) — 포털 전체 색인

저장소 측 준비는 완료되었습니다. 남은 것은 계정에서 소유권 확인 + 사이트맵 제출입니다.

### 저장소에서 완료됨 ✅
- `robots.txt` — 전체 크롤 허용 + 사이트맵 위치 명시
- `sitemap.xml` — 포털 및 하위 프로젝트 11개 URL 등록
  (`/`, `/court-auction/`, `/dart-top100/`, `/korea-tourism/`, `/kmong-research/`,
  `/math-library/`, `/koi-coach/`, `/stay/`, `/refund/`, `/cover_designs.html`, `/privacy.html`)
- `index.html` — JSON-LD 구조화 데이터(Person·Organization·WebSite) + 검증 태그 자리

### 계정에서 직접 해야 함 ⏳
1. [Google Search Console](https://search.google.com/search-console) 접속 (jds068888@gmail.com)
2. **속성 추가 → URL 접두어** → `https://stargateedu.co.kr/`
3. 소유권 확인 (택1):
   - **HTML 태그**: 발급된 `content` 토큰을 `index.html`의 주석 처리된
     `<meta name="google-site-verification" ...>` 에 넣고 주석 해제 → 커밋·푸시 → "확인"
   - 또는 도메인(DNS TXT) 방식 — `stargateedu.co.kr` 등록기관에서 TXT 추가
4. 확인 완료 후 **Sitemaps** 메뉴 → `sitemap.xml` 제출
5. (선택) **URL 검사**로 주요 페이지 색인 요청

---

## B. Google Play (TWA 앱) — Stargate 앱 배포

앱 빌드 절차 전체는 [`app/README.md`](README.md) 참고. 아래는 **개발자 계정 관점의 게이팅 항목**만.

### 저장소에서 완료됨 ✅
- `manifest.webmanifest` — 이름·아이콘(maskable 포함)·테마색 등 설치 요건 충족
- `sw.js` / `offline.html` — 오프라인 폴백
- `privacy.html` — 개인정보처리방침 (Play 필수, URL: `https://stargateedu.co.kr/privacy.html`)
- `app/twa-manifest.json` — 패키지 `kr.co.stargateedu.app`, Bubblewrap 설정
- `.well-known/assetlinks.json` — Digital Asset Links **골격**(지문 자리 2개)

### 계정/로컬에서 직접 해야 함 ⏳
1. **개발자 등록**: [Play Console](https://play.google.com/console) 계정 등록 ($25 1회) + 본인 인증
   - ⚠️ 2023-11 이후 개인 계정은 프로덕션 공개 전
     **비공개 테스트 12명 × 14일 연속** 요건 있음 → 일정 미리 확보
2. **업로드 키 생성**(로컬, 최초 1회) — `app/README.md` 1단계. 키스토어는 **절대 커밋 금지**
   (이미 `.gitignore` 처리됨)
3. **assetlinks 지문 채우기** — 아래 두 자리를 실제 SHA-256 지문으로 교체 후 커밋·푸시:
   - `.well-known/assetlinks.json`
     - `REPLACE_WITH_UPLOAD_KEY_SHA256_FINGERPRINT`
       ← `keytool -list -v -keystore stargate-upload.keystore -alias stargate | grep SHA256`
     - `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT`
       ← 첫 업로드 후 Play Console → 설정 → 앱 서명 페이지의 **앱 서명 키** 지문
   - 검증: [Statement List Tester](https://developers.google.com/digital-asset-links/tools/generator)
     에 `stargateedu.co.kr` + `kr.co.stargateedu.app` 입력 → 초록불
4. **스토어 등록정보 자산** 준비:
   - 앱 아이콘 512×512 → `assets/icons/icon-512.png` 사용 가능 ✅
   - 피처 그래픽 1024×500, 휴대전화 스크린샷 2장 이상 (실기기 캡처) ⏳
   - 짧은 설명(80자)/전체 설명(4000자) ⏳
5. **AAB 업로드**: `bubblewrap build` → `app-release-bundle.aab` → 내부 테스트 트랙 →
   (개인 계정: 비공개 테스트 14일) → 프로덕션 심사 제출

---

## C. 우선순위 요약

| 순서 | 작업 | 담당 | 상태 |
|---|---|---|---|
| 1 | robots.txt / sitemap.xml / 구조화 데이터 | 저장소 | ✅ 완료 |
| 2 | Search Console 소유권 확인 + 사이트맵 제출 | 계정 | ⏳ |
| 3 | Play 개발자 등록($25) + 본인 인증 | 계정 | ⏳ |
| 4 | 업로드 키 생성 + assetlinks 지문 2개 교체 | 로컬→저장소 | ⏳ |
| 5 | 스토어 자산(피처 그래픽·스크린샷·설명) | 계정 | ⏳ |
| 6 | 내부→비공개(14일)→프로덕션 심사 | 계정 | ⏳ |

> 참고: Search Console(B의 앞단, A)은 앱 배포와 독립적으로 **지금 바로** 진행 가능하며,
> 포털의 모든 프로젝트가 Google 검색에 노출되는 가장 빠른 개선입니다.
