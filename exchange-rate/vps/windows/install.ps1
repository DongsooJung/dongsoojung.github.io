# 1회 설치 (Windows) — 최초 수집 실행 + 매월 자동 실행(작업 스케줄러) 등록.
# 관리자 PowerShell 에서 실행:
#   powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfgPath  = Join-Path $here 'exim-config.txt'
$bat      = Join-Path $here 'Run_Update.bat'
$taskName = 'EximDashboardMonthly'

if(-not (Test-Path $cfgPath)){
  Write-Host '설정 파일(exim-config.txt)이 없습니다.'
  Write-Host '  copy exim-config.example.txt exim-config.txt  후 키를 채우고 다시 실행하세요.'
  exit 1
}
foreach($cmd in 'git','python'){
  if(-not (Get-Command $cmd -ErrorAction SilentlyContinue)){
    Write-Host "$cmd 이(가) 필요합니다. 설치 후 다시 실행하세요. (git-scm.com / python.org)"
    exit 1
  }
}

Write-Host '== 최초 수집 실행 =='
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'update.ps1')

Write-Host ''
Write-Host '== 매월 자동 실행 등록 (작업 스케줄러) =='
schtasks /Create /TN $taskName /TR "`"$bat`"" /SC MONTHLY /D 2 /ST 12:00 /F | Out-Null
if($LASTEXITCODE -eq 0){
  Write-Host "등록 완료: 작업 '$taskName' — 매월 2일 12:00 자동 실행"
  Write-Host "확인:  schtasks /Query /TN $taskName"
  Write-Host "로그:  $here\exim-update.log"
} else {
  Write-Host '작업 등록 실패 — 관리자 권한 PowerShell 에서 실행했는지 확인하세요.'
}
