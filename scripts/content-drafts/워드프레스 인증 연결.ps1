$ErrorActionPreference = 'Stop'
$site = 'stargatelearn.com'
$repository = 'DongsooJung/dongsoojung.github.io'

Write-Host "대상: https://$site → GitHub $repository 의 초안 생성 작업"
Write-Host 'WordPress 사용자 프로필에서 만든 애플리케이션 비밀번호를 입력하세요. 계정 로그인 비밀번호는 입력하지 마세요.'
$wpUser = Read-Host 'WordPress 사용자명'
if ([string]::IsNullOrWhiteSpace($wpUser)) { throw '사용자명이 필요합니다.' }
$securePassword = Read-Host '애플리케이션 비밀번호 (화면에 표시되지 않습니다)' -AsSecureString
if ($securePassword.Length -eq 0) { throw '애플리케이션 비밀번호가 필요합니다.' }
$credential = [System.Management.Automation.PSCredential]::new($wpUser.Trim(), $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password

try {
    & gh auth status --hostname github.com 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw '먼저 gh auth login으로 GitHub에 로그인하세요.' }

    $authBytes = [System.Text.Encoding]::UTF8.GetBytes("$($credential.UserName):$plainPassword")
    $authHeader = 'Basic ' + [Convert]::ToBase64String($authBytes)
    try {
        $verifiedUser = Invoke-RestMethod -Uri "https://$site/wp-json/wp/v2/users/me?context=edit" -Headers @{ Authorization = $authHeader } -MaximumRedirection 0
    } catch {
        throw 'WordPress 인증 확인에 실패했습니다. GitHub에는 저장하지 않았습니다. 사용자명과 애플리케이션 비밀번호를 확인하세요.'
    }
    if (-not $verifiedUser.id -or -not $verifiedUser.capabilities.edit_posts) {
        throw '초안 편집 권한을 확인하지 못했습니다. GitHub에는 저장하지 않았습니다.'
    }

    $values = [ordered]@{ WP_SITE = $site; WP_USER = $credential.UserName; WP_APP_PASSWORD = $plainPassword }
    foreach ($secretName in $values.Keys) {
        $values[$secretName] | & gh secret set $secretName --repo $repository
        if ($LASTEXITCODE -ne 0) { throw "$secretName 저장에 실패했습니다. 앞서 저장된 항목은 GitHub 설정에서 확인하세요." }
    }
    Write-Host '인증 확인과 GitHub Secrets 3개 저장을 완료했습니다. 비밀번호는 출력하거나 파일에 저장하지 않았습니다.'
    Write-Host '이제 content-drafts.yml을 count=1, require_wordpress=true, dry_run=false로 실행해 실제 초안 재조회를 확인하세요.'
} finally {
    if ($authBytes) { [Array]::Clear($authBytes, 0, $authBytes.Length) }
    $plainPassword = $null
    $authHeader = $null
    $values = $null
    $credential = $null
    $securePassword.Dispose()
}
