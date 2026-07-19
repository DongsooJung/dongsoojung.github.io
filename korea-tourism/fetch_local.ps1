# 방한 외래관광객 통계 수집 (국내망 실행용)
# data.go.kr가 해외 IP를 차단하므로 한국 네트워크의 PC에서 실행합니다.
# 필요: Windows PowerShell 5.1+ (기본 내장), git (푸시까지 하려면)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DataPath = Join-Path $PSScriptRoot "data.json"
$FallbackPath = Join-Path $PSScriptRoot "fallback-data.js"

$Countries = @(
    @{ key = "china";   natCd = "112"; label = "중국";   match = @("중국") },
    @{ key = "taiwan";  natCd = "125"; label = "대만";   match = @("대만", "타이완") },
    @{ key = "vietnam"; natCd = "240"; label = "베트남"; match = @("베트남") }
)
$Urls = @(
    "https://apis.data.go.kr/B551011/EdrcntTourismStatsService1/getEdrcntTourismStatsList1",
    "https://apis.data.go.kr/B551011/EdrcntTourismStatsService/getEdrcntTourismStatsList",
    "http://openapi.tour.go.kr/openapi/service/EdrcntTourismStatsService/getEdrcntTourismStatsList"
)

$Key = $env:TOUR_API_KEY
if (-not $Key) {
    $Key = Read-Host "data.go.kr 인증키(Decoding)를 입력하세요"
}
$Key = $Key.Trim()
if (-not $Key) { Write-Host "키가 없어 종료합니다."; exit 1 }

function Invoke-TourApi([string]$Url, [string]$Ym, [string]$NatCd) {
    $full = "{0}?serviceKey={1}&YM={2}&NAT_CD={3}&ED_CD=E&_type=json" -f $Url, [uri]::EscapeDataString($Key), $Ym, $NatCd
    $resp = Invoke-WebRequest -Uri $full -TimeoutSec 30 -UseBasicParsing
    $text = $resp.Content
    if ($text.TrimStart().StartsWith("<")) { throw "XML 오류 응답: $($text.Substring(0, [Math]::Min(200, $text.Length)))" }
    $json = $text | ConvertFrom-Json
    $code = $json.response.header.resultCode
    if ($code -ne "0000" -and $code -ne "00") { throw "API 오류 $code : $($json.response.header.resultMsg)" }
    $item = $json.response.body.items.item
    if (-not $item) { return $null }   # 미공표 월
    if ($item -is [array]) { $item = $item[0] }
    return @{ num = [int]$item.num; nat = [string]$item.natKorNm }
}

# 1) 작동하는 엔드포인트 선택
$ApiUrl = $null
foreach ($u in $Urls) {
    try {
        $r = Invoke-TourApi $u "202401" "112"
        Write-Host "엔드포인트 확인: $u" -ForegroundColor Green
        if ($r) { Write-Host ("  2024-01 중국 = {0:N0}명" -f $r.num) }
        $ApiUrl = $u; break
    } catch {
        Write-Host "실패: $u`n  $($_.Exception.Message)" -ForegroundColor Yellow
    }
}
if (-not $ApiUrl) {
    Write-Host "`n모든 엔드포인트 실패. 인증키가 '출입국관광통계서비스(15000297)'에 활용신청되어 있는지 확인하세요." -ForegroundColor Red
    exit 1
}

# 2) 기존 data.json 로드
$data = Get-Content $DataPath -Raw -Encoding UTF8 | ConvertFrom-Json
$byYm = @{}
foreach ($row in $data.series) { $byYm[$row.ym] = $row }

# 3) 2024-01 ~ 이번 달 수집
$updated = 0
$now = Get-Date
foreach ($c in $Countries) {
    $cur = Get-Date -Year 2024 -Month 1 -Day 1
    while ($cur -le $now) {
        $ym = $cur.ToString("yyyyMM"); $ymDash = $cur.ToString("yyyy-MM")
        try {
            $r = Invoke-TourApi $ApiUrl $ym $c.natCd
        } catch {
            Write-Host "  ! $ymDash $($c.label): $($_.Exception.Message)" -ForegroundColor Yellow
            $cur = $cur.AddMonths(1); continue
        }
        if ($r) {
            $natCompact = $r.nat -replace "\s", ""
            $ok = $false
            foreach ($m in $c.match) { if ($natCompact -like "*$m*") { $ok = $true } }
            if (-not $ok) { Write-Host "  !! 국적코드 $($c.natCd) 응답이 '$($r.nat)' — 중단" -ForegroundColor Red; exit 1 }
            if (-not $byYm.ContainsKey($ymDash)) {
                $byYm[$ymDash] = [pscustomobject]@{ ym = $ymDash; china = $null; taiwan = $null; vietnam = $null }
            }
            $row = $byYm[$ymDash]
            if ($row.$($c.key) -ne $r.num) {
                $row.$($c.key) = $r.num; $updated++
                Write-Host ("  {0} {1}: {2:N0}명" -f $ymDash, $c.label, $r.num)
            }
            if ($row.PSObject.Properties["approx"] -and $row.approx) {
                $row.approx = @($row.approx | Where-Object { $_ -ne $c.key })
                if ($row.approx.Count -eq 0) { $row.PSObject.Properties.Remove("approx") }
            }
        }
        Start-Sleep -Milliseconds 150
        $cur = $cur.AddMonths(1)
    }
}

# 4) 저장 (빈 월 제거, 정렬, BOM 없는 UTF-8)
$series = @($byYm.Values | Where-Object { $_.china -or $_.taiwan -or $_.vietnam } | Sort-Object ym)
$data.series = $series
if ($updated -gt 0) {
    $data.updatedAt = (Get-Date -Format "yyyy-MM-dd")
    $data.sourceMode = "api"
}
$jsonOut = $data | ConvertTo-Json -Depth 6
$enc = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($DataPath, $jsonOut + "`n", $enc)
[System.IO.File]::WriteAllText($FallbackPath, "window.FALLBACK_DATA = " + ($data | ConvertTo-Json -Depth 6 -Compress) + ";`n", $enc)
Write-Host "`n완료: $updated 개 값 갱신, 총 $($series.Count) 개월." -ForegroundColor Green

# 5) git 커밋·푸시 (가능하면)
if ($updated -gt 0 -and (Get-Command git -ErrorAction SilentlyContinue)) {
    Push-Location $RepoRoot
    git add korea-tourism/data.json korea-tourism/fallback-data.js
    git commit -m "chore(korea-tourism): 방한 관광객 통계 갱신 (국내망 수동 실행)"
    git push
    Pop-Location
    Write-Host "커밋·푸시 완료. 1~2분 후 사이트에 반영됩니다." -ForegroundColor Green
} elseif ($updated -gt 0) {
    Write-Host "git을 찾지 못했습니다. data.json / fallback-data.js 를 직접 커밋해 주세요." -ForegroundColor Yellow
}
