#!/usr/bin/env bash
# 법원경매 부동산 데이터 수집 - 국내망 실행 (mac/Linux)
# 사용법: ./run_domestic.sh [full|daily]
set -e
cd "$(dirname "$0")"

echo ""
echo "===== 법원경매 부동산 데이터 수집 (국내망) ====="
echo ""

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "[오류] Python3가 설치되어 있지 않습니다. https://www.python.org 에서 설치 후 다시 실행하세요."
  exit 1
fi
echo "[확인] Python: $($PY --version 2>&1)"

echo "[진행] 패키지 설치 (requests, openpyxl)..."
"$PY" -m pip install --quiet --upgrade requests openpyxl

MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo ""
  echo "수집 방식 선택:  [1] 전체 백필   [2] 일간 증분"
  read -r -p "번호 입력 (기본 1): " SEL
  if [ "$SEL" = "2" ]; then MODE="daily"; else MODE="full"; fi
fi

echo ""
if [ "$MODE" = "daily" ]; then
  echo "[실행] 일간 증분 수집..."
  "$PY" fetch_court_auction.py --daily
else
  echo "[실행] 전체 백필 수집..."
  "$PY" fetch_court_auction.py
fi

echo ""
echo "[완료] data.json / 엑셀 갱신 완료."
read -r -p "GitHub에 커밋·푸시할까요? (라이브 반영) [y/N]: " PUSH
if [ "$PUSH" = "y" ] || [ "$PUSH" = "Y" ]; then
  git -C .. add court-auction
  git -C .. commit -m "chore(court-auction): update auction data $(date +%F)"
  git -C .. push
  echo "[완료] 푸시 완료."
else
  echo "커밋·푸시는 건너뜁니다."
fi
