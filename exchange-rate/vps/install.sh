#!/usr/bin/env bash
# 1회 설치 — 국내 VPS/PC에서 실행. 최초 수집을 돌리고, 매월 자동 실행을 등록한다.
#
# 사용법:
#   1) exim-update.env.example 를 복사해 키를 채운다:
#        cp exim-update.env.example /etc/exim-update.env  &&  vi /etc/exim-update.env
#   2) ./install.sh /etc/exim-update.env
#
# 이후엔 매월 2일 자동 실행되며 사람이 손댈 필요가 없다.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${1:-/etc/exim-update.env}"
TAG="# exim-dashboard-monthly"

if [ ! -f "$ENV_FILE" ]; then
  echo "env 파일이 없습니다: $ENV_FILE"
  echo "  cp $HERE/exim-update.env.example $ENV_FILE  후 키를 채우고 다시 실행하세요."
  exit 1
fi
chmod 600 "$ENV_FILE" || true

command -v git >/dev/null    || { echo "git 이 필요합니다 (apt install git)"; exit 1; }
command -v python3 >/dev/null || { echo "python3 이 필요합니다 (apt install python3)"; exit 1; }
command -v crontab >/dev/null || { echo "cron 이 필요합니다 (apt install cron)"; exit 1; }

echo "== 최초 수집 실행 =="
EXIM_ENV_FILE="$ENV_FILE" bash "$HERE/update.sh"

LOG_FILE="${LOG_FILE:-$HOME/exim-update.log}"
CRON_LINE="0 12 2 * * EXIM_ENV_FILE=$ENV_FILE bash $HERE/update.sh >> $LOG_FILE 2>&1 $TAG"
# 기존 등록 제거 후 재등록 (중복 방지)
( crontab -l 2>/dev/null | grep -vF "$TAG" || true; echo "$CRON_LINE" ) | crontab -

echo
echo "== 설치 완료 =="
echo "매월 2일 12:00(서버 시간대 기준) 자동 실행됩니다. 로그: $LOG_FILE"
echo "서버 시간대가 KST가 아니면  sudo timedatectl set-timezone Asia/Seoul  권장."
echo "등록된 cron:"
crontab -l | grep -F "$TAG"
