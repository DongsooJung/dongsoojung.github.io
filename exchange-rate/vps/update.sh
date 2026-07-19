#!/usr/bin/env bash
# 환율 데이터 자동 갱신 러너 — 국내(한국) IP 머신에서 주기 실행.
#
# 수출입은행 API는 해외 IP를 차단하므로, 국내 VPS/PC에서 이 스크립트를 cron으로
# 돌리면 국내 IP로 정상 수집된다. 저장소를 최신으로 맞추고 fetch_data.py를 실행해
# data.json 이 바뀌면 커밋·푸시한다.
#
# 설정은 env 파일(기본 /etc/exim-update.env)에서 읽는다. 아래 변수 필요:
#   EXIM_API_KEY   수출입은행 인증키 (필수)
#   GH_TOKEN       GitHub Fine-grained PAT — 이 저장소 Contents: Read and write (필수)
#   REPO_DIR       로컬 클론 경로 (기본 $HOME/exim-dashboard)
#   BRANCH         푸시 대상 브랜치 (기본 main)
#   REPO_SLUG      owner/repo (기본 DongsooJung/dongsoojung.github.io)
set -euo pipefail

ENV_FILE="${EXIM_ENV_FILE:-/etc/exim-update.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

: "${EXIM_API_KEY:?EXIM_API_KEY 미설정 (env 파일 확인)}"
: "${GH_TOKEN:?GH_TOKEN 미설정 (env 파일 확인)}"
REPO_DIR="${REPO_DIR:-$HOME/exim-dashboard}"
BRANCH="${BRANCH:-main}"
REPO_SLUG="${REPO_SLUG:-DongsooJung/dongsoojung.github.io}"
REMOTE="https://x-access-token:${GH_TOKEN}@github.com/${REPO_SLUG}.git"

log(){ echo "[$(date '+%F %T')] $*"; }

if [ ! -d "$REPO_DIR/.git" ]; then
  log "최초 클론 → $REPO_DIR"
  git clone --depth 50 "$REMOTE" "$REPO_DIR"
fi
cd "$REPO_DIR"
git remote set-url origin "$REMOTE"
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git reset --hard --quiet "origin/$BRANCH"

log "환율 수집 시작 (fetch_data.py)"
EXIM_API_KEY="$EXIM_API_KEY" python3 exchange-rate/fetch_data.py

if git diff --quiet exchange-rate/data.json exchange-rate/fallback-data.js; then
  log "변경 없음 — 커밋 생략"
  exit 0
fi

git add exchange-rate/data.json exchange-rate/fallback-data.js
git -c user.name="${GIT_NAME:-exim-vps-bot}" \
    -c user.email="${GIT_EMAIL:-exim-vps-bot@users.noreply.github.com}" \
    commit -q -m "chore(exchange-rate): 환율 데이터 자동 갱신 (VPS)"
git pull --rebase --quiet origin "$BRANCH" || true
git push --quiet origin "$BRANCH"
log "푸시 완료 — 대시보드 환율이 실데이터로 갱신됨"
