# stargate-main · AI 사이버 보안 링크 수정분

이 환경에는 `DongsooJung/stargate-main`(**portal.stargateedu.co.kr**) **write 권한이 없어**
PRODUCT 3 카드 연결 변경을 여기 동봉합니다.

## 배경

- 제품 랜딩은 `https://stargateedu.co.kr/cybersecurity/` 에 배포됨 (dongsoojung.github.io)
- 포털 본사(`portal.stargateedu.co.kr`) PRODUCT 3 카드는 아직 `blog.stargateedu.co.kr` 를 가리킴
- HTTPS(`https://portal.stargateedu.co.kr`)는 커스텀 도메인 인증서가 발급되지 않아
  브라우저에서 `NET::ERR_CERT_COMMON_NAME_INVALID` 가 납니다.
  → GitHub → stargate-main → Settings → Pages 에서 **Enforce HTTPS** 를 켜면 해결됩니다.
  HTTP(`http://portal.stargateedu.co.kr`)로는 접속됩니다.

## 빠른 적용 (파일 복사)

```bash
git clone https://github.com/DongsooJung/stargate-main.git
cd stargate-main
git checkout -b cursor/link-3ai-cybersecurity
cp ../dongsoojung.github.io/patches/stargate-main/index.html ./
cp "../dongsoojung.github.io/patches/stargate-main/스타게이트 통합 네비.js" ./
git add index.html "스타게이트 통합 네비.js"
git commit -m "feat: PRODUCT 3 AI Cybersecurity Suite를 제품 랜딩으로 연결"
git push -u origin HEAD
```

## 패치 적용

```bash
git apply path/to/dongsoojung.github.io/patches/stargate-main/link-3ai-cybersecurity.patch
```

## 포함 내용

- PRODUCT 3 CTA: `blog.stargateedu.co.kr` → `https://stargateedu.co.kr/cybersecurity/`
- 푸터 사업영역: `AI 사이버 보안` 링크 추가
