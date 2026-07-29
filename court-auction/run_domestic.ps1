# 법원경매 부동산 데이터 수집 - 국내망 실행 스크립트
# 대화형:   run_domestic.bat 더블클릭
# 무인(스케줄러):  powershell -File run_domestic.ps1 daily push
#   arg0 = full | daily   (없으면 대화형으로 물어봄)
#   arg1 = push           (있으면 커밋·푸시까지 자동, 창 대기 없음)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$repo = Split-Path $PSScriptRoot -Parent

$mode = $args[0]
$pushArg = $args[1]
$interactive = -not $mode
function Pause-IfInteractive { if ($interactive) { Read-Host "엔터를 누르면 종료" } }

Write-Host ""
Write-Host "===== 법원경매 부동산 데이터 수집 (국내망) =====" -ForegroundColor Cyan
Write-Host ("실행 시각: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-Host ""

# 1) Python 확인
$py = $null
foreach ($cand in @("python", "py")) {
  try { & $cand --version *> $null; if ($LASTEXITCODE -eq 0) { $py = $cand; break } } catch {}
}
if (-not $py) {
  Write-Host "[오류] Python이 설치되어 있지 않습니다." -ForegroundColor Red
  Write-Host "       https://www.python.org 에서 설치(설치 시 'Add to PATH' 체크) 후 다시 실행하세요."
  Pause-IfInteractive; exit 1
}
Write-Host ("[확인] Python 버전: " + (& $py --version 2>&1))

# 2) 패키지 설치
Write-Host "[진행] 필요한 패키지 설치 (requests, openpyxl)..."
& $py -m pip install --quiet --upgrade requests openpyxl
if ($LASTEXITCODE -ne 0) {
  Write-Host "[오류] 패키지 설치 실패. 인터넷 연결을 확인하세요." -ForegroundColor Red
  Pause-IfInteractive; exit 1
}

# 3) 수집 방식 (대화형일 때만 질문)
if ($interactive) {
  Write-Host ""
  Write-Host "수집 방식을 선택하세요:"
  Write-Host "  [1] 전체 백필  - 2026년 1월~현재, 주택+상업용 전체 재수집"
  Write-Host "  [2] 일간 증분  - 기존 데이터에 오늘 새로 등록된 물건만 추가(빠름)"
  $sel = Read-Host "번호 입력 (기본 1)"
  if ($sel -eq "2") { $mode = "daily" } else { $mode = "full" }
}

# 4) 수집 실행
Write-Host ""
if ($mode -eq "daily") {
  Write-Host "[실행] 일간 증분 수집 중... (법원경매정보 API)" -ForegroundColor Green
  & $py fetch_court_auction.py --daily
} else {
  Write-Host "[실행] 전체 백필 수집 중... (수 분 소요될 수 있음)" -ForegroundColor Green
  & $py fetch_court_auction.py
}
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "[오류] 수집에 실패했습니다." -ForegroundColor Red
  Write-Host "       - 국내 네트워크(해외 IP 차단)인지 확인하세요."
  Write-Host "       - 사이트 개편 시 fetch_court_auction.py 상단 주석을 참고해 갱신하세요."
  Pause-IfInteractive; exit 1
}

Write-Host ""
Write-Host "[완료] data.json / data_commercial.json / 엑셀이 갱신되었습니다." -ForegroundColor Green

# 5) GitHub 반영
$doPush = $false
if ($pushArg -eq "push") { $doPush = $true }
elseif ($interactive) {
  Write-Host ""
  $ans = Read-Host "변경분을 GitHub에 커밋·푸시할까요? (라이브 대시보드 즉시 반영) [y/N]"
  if ($ans -eq "y" -or $ans -eq "Y") { $doPush = $true }
}
if ($doPush) {
  try {
    git -C $repo add court-auction
    git -C $repo diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
      $today = Get-Date -Format "yyyy-MM-dd"
      git -C $repo commit -m "chore(court-auction): update auction data $today"
      git -C $repo push
      Write-Host "[완료] 푸시 완료 - GitHub Pages 재배포 후 라이브에 반영됩니다." -ForegroundColor Green
    } else {
      Write-Host "[정보] 변경된 신규 물건이 없어 커밋을 건너뜁니다."
    }
  } catch {
    Write-Host "[오류] git 작업 실패: $_" -ForegroundColor Red
    Write-Host "       git 로그인/원격 권한을 확인하세요. 데이터 파일은 이미 갱신되었습니다."
  }
} else {
  Write-Host "커밋·푸시는 건너뜁니다. 생성된 파일만 로컬에서 확인하세요."
}
Write-Host ""
Pause-IfInteractive
