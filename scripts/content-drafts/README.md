# 콘텐츠 초안 반자동화 (stargatelearn.com)

Claude가 영문 올림피아드 수학 글 초안을 쓰고, 별도 호출이 문제를 다시 풀어 정답을 대조합니다. 결과는 WordPress에 **초안(draft)으로만** 올라가며, 게시는 wp-admin에서 직접 합니다.

## 흐름

1. 공개 글 제목 50개를 읽어 겹치지 않는 주제를 고릅니다 (`--topic`으로 지정 가능).
2. `claude-opus-5-5`(effort `high`)가 구조화 출력으로 제목·슬러그·요약·태그·문제 목록·본문 HTML을 만듭니다.
3. 두 번째 호출이 본문을 보지 않고 문제만 풀어 정답을 비교합니다. 불일치가 있으면 제목 앞에 `[검토 필요]`가 붙습니다.
4. 본문 HTML은 허용 태그만 남기고 속성을 모두 지웁니다.
5. WordPress 자격증명이 있으면 초안을 만들고, 없으면 `out/`에 HTML과 `report.md`만 남깁니다.

거절(`refusal`) 시 서버 측 폴백(`fallbacks: "default"`)이 켜져 있습니다.

## 실행

GitHub Actions: `Content drafts (Claude, WordPress draft only)` — 매주 월요일 09:00 KST 2편, 또는 수동 실행(편수·주제·dry run 지정).

로컬(PowerShell):

```powershell
cd scripts/content-drafts
npm ci
$env:ANTHROPIC_API_KEY = Get-Content "$env:USERPROFILE\.config\stargate-secrets\anthropic-key.txt" -Raw
node generate-drafts.mjs --count 1 --dry-run
```

## 시크릿

| 이름 | 필수 | 설명 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 예 | Claude API 키 |
| `WP_SITE` | 아니오 | `stargatelearn.com` |
| `WP_USER` | 아니오 | WordPress 사용자명 |
| `WP_APP_PASSWORD` | 아니오 | 사용자 프로필의 애플리케이션 비밀번호 |

생성된 초안은 커밋하지 않습니다. 이 저장소는 공개이고 루트가 서빙됩니다.
