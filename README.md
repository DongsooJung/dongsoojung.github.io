# DongsooJung.github.io

정동수(Dongsoo Jung) 개인 포털 · GitHub user site.

- Live: https://dongsoojung.github.io/
- Featured sub-project: https://dongsoojung.github.io/stargate-ai-gallery/

## 구성

- `index.html` — 포털 랜딩 페이지 (프로젝트 카드 그리드 + About)
- `404.html` — 커스텀 404
- `CNAME` — 커스텀 도메인 `stargateedu.co.kr`
- `manifest.webmanifest` / `sw.js` / `offline.html` / `assets/icons/` — PWA (앱 설치 요건)
- `.well-known/assetlinks.json` — Android 앱(TWA) 도메인 소유 증명
- `privacy.html` — 개인정보처리방침 (Play Store 필수)
- `app/` — Google Play용 Stargate 앱(TWA) 빌드 설정 → [app/README.md](app/README.md)
- `.nojekyll` — GitHub Pages가 `.well-known/`을 서빙하도록 Jekyll 비활성화

## 로컬 확인

```powershell
Start-Process "index.html"
```

## 배포

main 브랜치 루트 그대로 GitHub Pages 에서 서빙. 푸시 후 1~2분 내 반영.
