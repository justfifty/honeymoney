<#
.SYNOPSIS
  Rotate the PocketBase superuser with no downtime, and write the new
  credential to the gitignored secrets runbook.

.DESCRIPTION
  The existing superuser (admin@honeymoney.local) has two problems that have
  nothing to do with password strength:

    1. Its password has been read aloud into a chat transcript, so it must be
       treated as public regardless of how good it is.
    2. admin@honeymoney.local is not a deliverable address, so PocketBase's own
       password-reset flow can never reach anybody. A lost password would mean
       SSH-ing to the host to recover -- fine for us, not fine as a design.

  -- WHY A SECOND SUPERUSER RATHER THAN CHANGING THE PASSWORD --------------

  Changing the password in place breaks both running apps the instant it takes
  effect, and they stay broken until two separate env files are updated and two
  services restarted. That is a window of real user-facing 500s for a routine
  security task.

  Creating a NEW superuser first means the old credentials keep working
  throughout. The cutover is: create, verify, switch env, restart, verify
  again, and only then delete the old account. Nothing is ever in a state where
  the app cannot authenticate.

  -- THE PASSWORD IS GENERATED HERE, NOT CHOSEN ----------------------------

  32 URL-safe characters from a cryptographic RNG. It is written straight to
  secrets\deploy-credentials.md (gitignored) and never printed to the console,
  because a console scrollback is a place secrets get copied out of. Read it
  from that file when you need it, and put it in your password manager.

  A password you type is a password that has been somewhere -- a chat window, a
  message, a sticky note. This one has been nowhere.

.PARAMETER Email
  The new superuser's address. Use a real inbox you control, so PocketBase's
  password reset can actually reach you.

.PARAMETER SkipCutover
  Create and verify the new superuser, but do not touch env files, restart
  anything, or delete the old account. Use this to do the risky half by hand.

.EXAMPLE
  ./rotate-superuser.ps1 -Email justfifty1976@gmail.com
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Email,
  [string]$KeyFile = "$PSScriptRoot\domcloud\id_domcloud",
  [switch]$SkipCutover
)

$ErrorActionPreference = 'Stop'
$repo    = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $repo 'web\.env.local'
$secrets = Join-Path $repo 'secrets\deploy-credentials.md'
$pbHost  = (Get-Content "$PSScriptRoot\domcloud\.pbhost" -Raw).Trim()
$appHost = (Get-Content "$PSScriptRoot\domcloud\.host"   -Raw).Trim()
$pbUrl   = 'https://honeymoney-pb.domcloud.dev'

function Note($m) { Write-Host "  $m" }

# -- 1. a password that has never been anywhere ------------------------------
$bytes = [byte[]]::new(24)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$pw = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
Note "generated a $($pw.Length)-character password (not shown)"

# -- 2. create it on the host ------------------------------------------------
#
# Via the CLI rather than the REST API, deliberately: the CLI works even when
# the HTTP layer is wedged, which is exactly when you most need a way in.
#
# `--encryptionEnv` is sourced first. PocketBase refuses to start at all without
# the key once settings encryption is on -- "invalid settings db data or missing
# encryption key" -- so a CLI call that skips it fails in a way that looks like
# a corrupt database rather than a missing variable.
$remote = @"
set -euo pipefail
cd ~/public_html
set -a; . ~/.env.pocketbase; set +a
./pocketbase superuser upsert '$Email' '$pw' --dir ./pb_data
echo OK
"@
# Written BOM-less and scp'd rather than piped: PowerShell's pipeline emits a
# UTF-8 BOM, and bash reads the BOM as part of the first command.
$tmp = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp, ($remote -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding $false))
try {
  scp -i $KeyFile -o StrictHostKeyChecking=accept-new $tmp "${pbHost}:~/hm-rotate.sh" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "scp failed" }
  $out = ssh -i $KeyFile -o StrictHostKeyChecking=accept-new $pbHost 'bash ~/hm-rotate.sh; rc=$?; rm -f ~/hm-rotate.sh; exit $rc'
  if ($LASTEXITCODE -ne 0) { throw "superuser upsert failed: $out" }
} finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
Note "superuser $Email created on the host"

# -- 3. prove it works BEFORE anything depends on it -------------------------
$auth = Invoke-RestMethod -Method Post -Uri "$pbUrl/api/collections/_superusers/auth-with-password" `
  -ContentType 'application/json' `
  -Body (@{ identity = $Email; password = $pw } | ConvertTo-Json)
if (-not $auth.token) { throw "the new superuser does not authenticate -- stopping before the cutover" }
Note "verified: the new superuser authenticates"

# -- 4. record it where it belongs -------------------------------------------
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
$block = @"

## PocketBase superuser (rotated $stamp)

- URL: $pbUrl/_/
- Email: $Email
- Password: $pw

Replaces admin@honeymoney.local, whose password was exposed in a session
transcript on 2026-08-27. Delete the old account once the app is confirmed
healthy on this one.
"@
Add-Content -Path $secrets -Value $block -Encoding utf8
Note "written to secrets\deploy-credentials.md (gitignored)"

if ($SkipCutover) {
  Write-Host "`nCreated and verified. Cutover skipped -- update the two env files yourself." -ForegroundColor Yellow
  exit 0
}

# -- 5. cut both apps over ---------------------------------------------------
#
# BOTH files, or the app half-works: the laptop and the DOM Cloud app read
# different env files and either one left behind means 500s from that half.
$local = Get-Content $envFile -Raw
$local = $local -replace '(?m)^POCKETBASE_ADMIN_EMAIL=.*$',    "POCKETBASE_ADMIN_EMAIL=$Email"
$local = $local -replace '(?m)^POCKETBASE_ADMIN_PASSWORD=.*$', "POCKETBASE_ADMIN_PASSWORD=$pw"
[System.IO.File]::WriteAllText($envFile, $local, (New-Object System.Text.UTF8Encoding $false))
Note "updated web\.env.local"

$remoteEnv = @"
set -euo pipefail
sed -i "s|^POCKETBASE_ADMIN_EMAIL=.*|POCKETBASE_ADMIN_EMAIL=$Email|"    ~/.env.honeymoney
sed -i "s|^POCKETBASE_ADMIN_PASSWORD=.*|POCKETBASE_ADMIN_PASSWORD=$pw|" ~/.env.honeymoney
mkdir -p ~/public_html/tmp && touch ~/public_html/tmp/restart.txt
echo OK
"@
$tmp2 = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($tmp2, ($remoteEnv -replace "`r`n", "`n"), (New-Object System.Text.UTF8Encoding $false))
try {
  scp -i $KeyFile -o StrictHostKeyChecking=accept-new $tmp2 "${appHost}:~/hm-env.sh" | Out-Null
  ssh -i $KeyFile -o StrictHostKeyChecking=accept-new $appHost 'bash ~/hm-env.sh; rc=$?; rm -f ~/hm-env.sh; exit $rc' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "remote env update failed" }
} finally { Remove-Item $tmp2 -Force -ErrorAction SilentlyContinue }
Note "updated ~/.env.honeymoney and asked Passenger to respawn"

# The laptop's own app needs an elevated restart or it keeps the old env; a
# hand-run stop gets a silent "Access is denied". See start-honeymoney.ps1.
Start-ScheduledTask -TaskName 'HoneyMoney'
Note "triggered the laptop restart task"

# -- 6. confirm, then and only then retire the old account -------------------
Write-Host "`nNow confirm both are healthy, then delete the old superuser:" -ForegroundColor Cyan
Write-Host "  curl -s https://honeymoney.app/api/health"
Write-Host "  (expect `"pocketbase`":true)"
Write-Host ""
Write-Host "  ssh -i $KeyFile $pbHost"
Write-Host "  cd ~/public_html && set -a; . ~/.env.pocketbase; set +a"
Write-Host "  ./pocketbase superuser delete admin@honeymoney.local --dir ./pb_data"
Write-Host ""
Write-Host "The new password is in secrets\deploy-credentials.md. Put it in your" -ForegroundColor Yellow
Write-Host "password manager and consider turning on the superuser IP allowlist." -ForegroundColor Yellow
