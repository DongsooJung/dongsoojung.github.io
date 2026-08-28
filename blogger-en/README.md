# 영문 Google Blogger 반자동화 (글로벌 수익화)

Blogger에 **영어**로 글을 올려 글로벌 검색·AdSense 수익을 내는 반자동 파이프라인입니다. 기계는 주제 리서치와 초안 브리핑만 하고, **사람이 승인한 뒤에만** 발행 API를 호출합니다.

**글을 고르는 기준은 저자가 쓰고 싶은 주제가 아니라 고객의 Job · Pain · 검색 의도입니다.** 고객 프로필에 안 맞는 급상승어는 버립니다.

운영 화면: https://stargateedu.co.kr/blogger-en/

## 현재 상태

`PLAN.md` 가 비어 있습니다. 계획을 이 파일에 붙여 넣으면 바로 설정으로 흡수합니다.

```bash
node blogger-en/scripts/cli.mjs ingest
node blogger-en/scripts/cli.mjs status
```

계획이 오기 전에 가능한 것:

- 영문권 Google Trends 리서치 (`US,GB,AU,CA,IN,SG`)
- 초안 브리핑 생성 (`[WRITE]` 블록, 사람 작성용)
- 검토 큐와 dry-run 발행 페이로드

`data/topics.json` · `data/queue.json` 에는 `research --fixture` 샘플이 들어 있습니다. 실서비스 주제가 아니며, 계획이 오면 덮어씁니다.

막혀 있는 것:

- `status: awaiting_plan` 이면 실발행 불가
- 사람 승인 없는 발행 불가
- `BLOGGER_ALLOW_LIVE=1` 없는 live 발행 불가

## 파이프라인

```
PLAN.md  →  ingest  →  config
Google Trends (EN geos)  →  research  →  data/topics.json
topics  →  draft  →  drafts/*.md + data/queue.json  (status: needs_review)
human review --approve  →  status: approved
publish (default dry-run)  →  Blogger API draft
publish --live  →  실제 발행 (비밀값 + 승인 + 품질 게이트)
```

## 명령

```bash
# 계획 흡수
node blogger-en/scripts/cli.mjs ingest
node blogger-en/scripts/cli.mjs ingest --plan blogger-en/fixtures/sample-plan.md

# 상태
node blogger-en/scripts/cli.mjs status

# 주제 리서치 (네트워크 없이 픽스처)
node blogger-en/scripts/cli.mjs research --fixture

# 실제 영문권 급상승어 (google-trends/fetch_data.py, KR 대시보드 파일은 건드리지 않음)
node blogger-en/scripts/cli.mjs research

# 상위 주제 3건 초안
node blogger-en/scripts/cli.mjs draft --limit 3

# 사람 승인 / 거절
node blogger-en/scripts/cli.mjs review --id draft-YYYYMMDD-slug --approve
node blogger-en/scripts/cli.mjs review --id draft-YYYYMMDD-slug --reject --reason "thin"

# 발행 페이로드만 확인 (기본)
node blogger-en/scripts/cli.mjs publish --id draft-YYYYMMDD-slug

# 실제 발행 — 환경 변수와 품질 게이트를 모두 통과해야 함
BLOGGER_ALLOW_LIVE=1 node blogger-en/scripts/cli.mjs publish --id draft-YYYYMMDD-slug --live
```

## 품질·정책 게이트

실발행은 아래를 모두 만족해야 합니다.

- `PLAN.md` 가 ingest 되어 `plan_ready`
- 큐 상태가 `approved`
- 본문에 `[WRITE]` 잔여 없음
- 한글 본문/제목 없음
- 최소 1,200단어 (설정 가능)
- `BLOGGER_BLOG_ID` + OAuth refresh token
- `BLOGGER_ALLOW_LIVE=1`

AdSense는 자동 생성 저품질 콘텐츠를 허용하지 않습니다. 이 저장소의 draft 명령은 **완성 글이 아니라 브리핑**을 만듭니다.

## 환경 변수

`.env.example` 참고. 브라우저에 넣지 않습니다.

| 변수 | 용도 |
|---|---|
| `BLOGGER_BLOG_ID` | Blogger 블로그 ID |
| `BLOGGER_CLIENT_ID` | OAuth 클라이언트 ID |
| `BLOGGER_CLIENT_SECRET` | OAuth 시크릿 |
| `BLOGGER_REFRESH_TOKEN` | `https://www.googleapis.com/auth/blogger` 스코프 |
| `BLOGGER_ALLOW_LIVE` | `1` 일 때만 `--live` 허용 |

Blogger API는 서비스 계정을 쓰지 않습니다. 블로그 소유 Google 계정 OAuth가 필요합니다.

## GitHub Actions

`.github/workflows/blogger-en.yml`

- PR/푸시: 단위 테스트
- `workflow_dispatch`: 영문권 Trends 리서치만 수행 (자동 발행 없음)

## 기존 자산과의 관계

| 자산 | 역할 |
|---|---|
| `google-trends/fetch_data.py` | 급상승어 수집. `OUTPUT_PATH` 로 `blogger-en/data/trends.json` 에만 저장 |
| `portfolio/blog/` | 한국어 Notion/Drive 포트폴리오. 이 파이프라인과 발행 대상이 다름 |
| `blog/` | `blog.stargateedu.co.kr` 리다이렉트. 그대로 유지 |
| `en/` | 영문 포털. 글의 저자/CTA 랜딩 |

## 계획이 오면 바로 채울 칸

`PLAN.md` 섹션: Customers (Job/Pain/Outcome/Intents), Content pillars, Cadence, Monetization, Voice, Do not, Blogger.
저자 니치는 입력하지 않습니다.
