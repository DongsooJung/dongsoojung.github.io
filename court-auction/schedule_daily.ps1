# 법원경매 일간 자동 수집 - Windows 작업 스케줄러 등록기
# 등록:  schedule_daily.bat            (또는 powershell -File schedule_daily.ps1)
# 해제:  schedule_daily.bat remove
$ErrorActionPreference = "Stop"
$taskName = "CourtAuctionDaily"
$ps1 = Join-Path $PSScriptRoot "run_domestic.ps1"

if ($args[0] -eq "remove") {
  try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "[완료] 예약 작업 '$taskName' 삭제됨." -ForegroundColor Green
  } catch { Write-Host "[정보] 등록된 작업이 없습니다." -ForegroundColor Yellow }
  Read-Host "엔터를 누르면 종료"; exit 0
}

Write-Host "===== 법원경매 일간 자동 수집 예약 등록 =====" -ForegroundColor Cyan
Write-Host "매일 오전 8시에 '일간 증분 수집 -> 커밋 -> 푸시' 를 무인 실행합니다."
Write-Host ""

$action  = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument ("-NoProfile -ExecutionPolicy Bypass -File `"" + $ps1 + "`" daily push") `
  -WorkingDirectory $PSScriptRoot
$trigger = New-ScheduledTaskTrigger -Daily -At 8:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Description "법원경매 일간 자동 수집(국내망)" -Force | Out-Null

Write-Host "[완료] 예약 작업 '$taskName' 등록됨 - 매일 08:00 실행." -ForegroundColor Green
Write-Host ""
Write-Host "확인:   taskschd.msc > 작업 스케줄러 라이브러리 > $taskName"
Write-Host "즉시 1회 테스트:  Start-ScheduledTask -TaskName $taskName"
Write-Host "예약 해제:  schedule_daily.bat remove"
Write-Host ""
Write-Host "[주의] 이 PC가 국내망에 있고 git 푸시 권한이 설정돼 있어야 합니다."
Read-Host "엔터를 누르면 종료"
