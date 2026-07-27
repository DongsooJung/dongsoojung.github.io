# stargateedu-shop KCP 심사 수정분

이 환경에는 `DongsooJung/stargateedu-shop` **write 권한이 없어** 쇼핑몰 변경을 여기 동봉합니다.
로컬 커밋은 `/tmp/repos/stargateedu-shop` 브랜치 `cursor/kcp-review-compliance-2792`에 준비되어 있습니다.

## 빠른 적용 (파일 복사)

```bash
git clone https://github.com/DongsooJung/stargateedu-shop.git
cd stargateedu-shop
git checkout -b cursor/kcp-review-compliance-2792
cp -R ../dongsoojung.github.io/patches/stargateedu-shop/. ./
git add -A
git commit -m "feat: KCP 결제 준비·약관·사업자·정기결제 고지 정비"
git push -u origin HEAD
```

## 패치 적용

```bash
git am path/to/stargateedu-shop-kcp-review.patch
```

## 포함 내용

- 사업자 정보(주소·전화·개인정보보호책임자) 푸터 통일
- 이용약관: 결제·정기결제·환불 조항
- 개인정보처리방침: NHN KCP 위탁·결제 항목
- `checkout.html`: KCP 결제 준비·약관 동의·정기결제 고지
- `/api/kcp/ready|return|approve` Lite Pay 연동(자격증명 없으면 503)

## 배포 시 남은 외부 의존성

- Vercel에 `KCP_SITE_CD`, `KCP_CERT_INFO`, `KCP_PRIVATE_KEY`, `CHECKOUT_SIGNING_SECRET`, `SITE_ORIGIN` 등록
- GitHub Pages DNS를 Vercel로 연결하거나 API 도메인 분리
- 정기결제 배치키는 KCP 별도 계약 후 연결
