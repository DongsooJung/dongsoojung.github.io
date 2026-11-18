# 콘텐츠 초안 반자동화 (stargatelearn.com)

Claude가 영문 올림피아드 수학 글 초안을 쓰고, 별도 호출이 문제를 다시 풀어 정답을 대조합니다. 결과는 WordPress에 **초안(draft)으로만** 올라가며, 게시는 wp-admin에서 직접 합니다.

## 흐름

1. 공개 글 제목을 모든 페이지에서 읽습니다. `WP_USER`·`WP_APP_PASSWORD`가 있으면 초안·검토 대기·예약 글도 확인합니다. 조회 실패 시 중복 확인 없이 생성을 계속하지 않습니다.
2. KST 월요일을 기준으로 20개 주제를 순환하며, 기존 제목과 생성 이력에 등장한 주제는 건너뜁니다. `--topic`은 수동 지정으로 이 순환을 우회합니다.
3. `claude-opus-5-5`(effort `high`)가 구조화 출력으로 제목·슬러그·요약·태그·문제 목록·본문 HTML을 만듭니다.
4. 두 번째 호출이 본문을 보지 않고 문제만 풀어 정답을 비교합니다. 불일치가 있으면 제목 앞에 `[검토 필요]`가 붙습니다.
5. 본문 HTML은 허용 태그만 남기고 속성을 모두 지웁니다.
6. WordPress 자격증명이 있으면 초안을 만들고, 없으면 `out/`에 HTML과 `report.md`만 남깁니다.

파일로 저장한 초안의 제목·선택 주제는 `out/topic-history.json`에 기록합니다. dry run도 이력에 포함되며, 같은 실행의 다음 글과 이후 실행이 함께 참고합니다. Actions는 이 파일을 캐시에 보존하고 복원합니다. 로컬은 같은 `--out` 경로를 사용해야 이력이 이어지며, 로컬과 Actions의 이력은 자동 공유하지 않습니다. 캐시는 만료·삭제될 수 있으므로 영구 보관 수단은 아니며, WordPress 자격증명이 있으면 실제 초안 목록이 추가 근거가 됩니다.

주제 판별은 제목의 영어 표현·별칭을 사용하므로 의미가 같은 모든 표현을 완전히 탐지하지는 못합니다. 순환 목록을 모두 사용하면 새 주제를 추가하거나 `--topic`으로 지정해야 합니다.

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

## 등록 결과 검증과 커넥터 인계

직접 REST 등록은 응답의 글 ID만으로 완료 처리하지 않습니다. 같은 ID를 인증된 편집 문맥으로 다시 조회해 `draft` 상태와 제목·본문·요약 원문을 대조합니다. 검증 실패 시 생성된 ID와 편집 주소를 남기며, 같은 글을 바로 재생성하지 않고 먼저 확인해야 합니다.

각 글의 `*.wordpress.json`에는 `status=draft`와 편집 가능한 `core/html` 블록 본문을 저장합니다. `WP_*`가 없는 환경에서는 Actions 아티팩트를 내려받아 연결된 WordPress 커넥터로 이 JSON을 등록하고 다시 조회할 수 있습니다. 이 경로는 Actions의 직접 REST 인증 성공과 구분합니다. HTML·JSON·검산 보고서는 기존 아티팩트에 함께 보관하며 공개 저장소에는 커밋하지 않습니다.

직접 등록이 반드시 필요한 수동 실행에서는 `require_wordpress=true`를 선택합니다. 인증정보가 없으면 Claude 호출 전에 실패합니다. `dry_run=true`와 함께 사용할 수 없습니다. 기본 예약 실행의 기존 동작은 유지합니다.

티스토리 47번 비공개 시험은 코드블록 입력·저장·본문 재조회까지 성공했습니다. 일반 TinyMCE 본문 입력은 현재 도구로 지원되지 않았으며, 코드블록 시험을 일반 글쓰기 자동화 성공으로 간주하지 않습니다. 일반 글은 사람이 편집기에 등록·검토하고 공개 URL을 확인하는 방식으로 운영합니다.
