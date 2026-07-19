# 환율 데이터 자동 갱신 러너 (Windows) — 국내 한국 IP PC에서 실행.
# 작업 스케줄러가 Run_Update.bat 를 통해 이 스크립트를 매월 실행한다.
# 설정은 같은 폴더의 exim-config.txt (KEY=VALUE) 에서 읽는다.

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
function Log($m){ Write-Host ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }
function Die($m){ Log "오류: $m"; exit 1 }

# --- 설정 로드 ---
$cfgPath = Join-Path $here 'exim-config.txt'
if(-not (Test-Path $cfgPath)){ Die "설정 파일이 없습니다: $cfgPath" }
$cfg = @{}
foreach($line in Get-Content $cfgPath -Encoding UTF8){
  $t = $line.Trim()
  if($t -eq '' -or $t.StartsWith('#')){ continue }
  $i = $t.IndexOf('=')
  if($i -lt 1){ continue }
  $cfg[$t.Substring(0,$i).Trim()] = $t.Substring($i+1).Trim()
}
$eximKey = $cfg['EXIM_API_KEY']
$ghToken = $cfg['GH_TOKEN']
if(-not $eximKey){ Die 'EXIM_API_KEY 미설정 (exim-config.txt 확인)' }
if(-not $ghToken){ Die 'GH_TOKEN 미설정 (exim-config.txt 확인)' }

$repoDir  = if($cfg['REPO_DIR']){ $cfg['REPO_DIR'] }  else { Join-Path $env:USERPROFILE 'exim-dashboard' }
$branch   = if($cfg['BRANCH']){ $cfg['BRANCH'] }      else { 'main' }
$repoSlug = if($cfg['REPO_SLUG']){ $cfg['REPO_SLUG'] } else { 'DongsooJung/dongsoojung.github.io' }
$remote   = "https://x-access-token:$ghToken@github.com/$repoSlug.git"

# --- 저장소 준비 ---
if(-not (Test-Path (Join-Path $repoDir '.git'))){
  Log "최초 클론 -> $repoDir"
  git clone --depth 50 $remote $repoDir
  if($LASTEXITCODE -ne 0){ Die 'git clone 실패' }
}
Set-Location $repoDir
git remote set-url origin $remote
git fetch --quiet origin $branch
git checkout --quiet $branch
git reset --hard --quiet "origin/$branch"

# --- 수집 ---
Log '환율 수집 시작 (fetch_data.py)'
$env:EXIM_API_KEY = $eximKey
python exchange-rate/fetch_data.py
if($LASTEXITCODE -ne 0){ Die '수집 실패 또는 API 도달 불가' }

# --- 변경 시 커밋/푸시 ---
git diff --quiet exchange-rate/data.json exchange-rate/fallback-data.js
if($LASTEXITCODE -eq 0){ Log '변경 없음 — 커밋 생략'; exit 0 }

git add exchange-rate/data.json exchange-rate/fallback-data.js
git -c user.name='exim-win-bot' -c user.email='exim-win-bot@users.noreply.github.com' commit -q -m 'chore(exchange-rate): 환율 데이터 자동 갱신 (Windows)'
git pull --rebase --quiet origin $branch
git push --quiet origin $branch
if($LASTEXITCODE -ne 0){ Die 'git push 실패 (GH_TOKEN 권한 확인)' }
Log '푸시 완료 — 대시보드 환율이 실데이터로 갱신됨'
