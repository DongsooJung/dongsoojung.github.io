# blog.stargateedu.co.kr 채널 재배치 패치

대상 저장소: [`DongsooJung/stargate-blog-hub`](https://github.com/DongsooJung/stargate-blog-hub)

## 변경 요약

| 채널 | 이전 | 이후 |
|------|------|------|
| 스타게이트 (`stargate8224`) | 네이버 개인 블로그 · 대치동 수학/입시 | **부동산 · 경제 블로그** |
| 스타게이트연구소 (`stargate8225`) | 네이버 법인 · 신간/강의/이벤트 | **수학 · AI 블로그** |
| 별로 향하는 문 (티스토리) | AI/테크 | **정치 · 데이터 블로그** |

함께 수정: meta keywords, 히어로 문구, 설문 주제, 콘텐츠 카테고리, RSS 최신글 태그(`scripts/build_hub_index.py`).

## 적용 방법 A — patch

```bash
git clone https://github.com/DongsooJung/stargate-blog-hub.git
cd stargate-blog-hub
git checkout -b cursor/blog-channel-reposition-f7aa
git apply /path/to/blog-channel-reposition.patch
# 또는 이 폴더의 파일로 덮어쓰기:
# cp -R templates scripts index.html README.md .
git add -A
git commit -m "feat(hub): reposition blog channels by topic"
git push -u origin HEAD
gh pr create --base main --title "feat(hub): 블로그 채널을 부동산·경제 / 수학·AI / 정치·데이터로 재배치"
```

## 적용 방법 B — 파일 덮어쓰기

이 디렉터리의 다음 파일을 `stargate-blog-hub` 루트에 그대로 복사합니다.

- `templates/허브_템플릿.html`
- `scripts/build_hub_index.py`
- `index.html` (빌드 산출물)
- `README.md`
