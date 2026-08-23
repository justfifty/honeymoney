<#
.SYNOPSIS
  Move the household ledger from this laptop to the DOM Cloud host. LAST STEP.

.DESCRIPTION
  Run this only after the app has been serving from DOM Cloud against THIS
  laptop's PocketBase for long enough to trust it. Order matters: proving the
  app runs elsewhere costs nothing if it fails, whereas moving the ledger and
  then discovering the host is wrong risks the one thing backups exist for.

  What it does, in order:
    1. Asks the LOCAL PocketBase for a fresh backup. A backup zip is a
       consistent snapshot; copying data.db out from under a running SQLite is
       not, and the difference only shows up as corruption later.
    2. Ships the settings-encryption key FIRST. A pb_data that arrives before
       its key is a file nobody can open -- PocketBase refuses to start at all:
       "invalid settings db data or missing encryption key".
    3. Ships the backup, stops the remote PocketBase, restores, restarts.
    4. Reads a collection back over HTTPS. A restore that has not been read
       from is a guess.

  It does NOT delete anything locally. The laptop keeps its pb_data, so the
  rollback is: point POCKETBASE_URL back at the tunnel.

.EXAMPLE
  ./migrate-pocketbase.ps1 -SshTarget honeymoney@sgp.domcloud.co -PbHost pb.honeymoney.app -Confirm
#>
[CmdletBinding()]
param(
  [string]$SshTarget,
  [Parameter(Mandatory)][string]$PbHost,      # public hostname of the remote PocketBase
  [int]$SshPort = 22,
  [string]$KeyFile = "$PSScriptRoot\id_domcloud",
  [string]$LocalPb = 'http://127.0.0.1:8090',
  [switch]$Confirm
)

$ErrorActionPreference = 'Stop'
$repo    = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$envFile = Join-Path $repo 'web\.env.local'
$keyPath = Join-Path $repo 'deploy\.pb-encryption-key'

if (-not $SshTarget) {
  $hostFile = Join-Path $PSScriptRoot '.host'
  if (Test-Path $hostFile) { $SshTarget = (Get-Content $hostFile -Raw).Trim() }
}
if (-not $SshTarget) { throw "No SSH target. Pass -SshTarget user@host or write $PSScriptRoot\.host" }

if (-not $Confirm) {
  Write-Host @"
This moves the household ledger to $SshTarget.
Nothing is deleted locally, but the remote pb_data is OVERWRITTEN.
Re-run with -Confirm when you mean it.
"@ -ForegroundColor Yellow
  return
}

function EnvValue($key) {
  $m = Select-String -Path $envFile -Pattern "^\s*$key\s*=\s*(.+?)\s*$" | Select-Object -First 1
  if ($m) { return $m.Matches.Groups[1].Value.Trim().Trim('"').Trim("'") }
  return ''
}

$sshArgs = @('-i', $KeyFile, '-p', $SshPort, '-o', 'StrictHostKeyChecking=accept-new')

# -- 1. Fresh backup from the local PocketBase -------------------------------
Write-Host "==> asking the local PocketBase for a fresh backup" -ForegroundColor Cyan
$email = EnvValue 'POCKETBASE_ADMIN_EMAIL'; $password = EnvValue 'POCKETBASE_ADMIN_PASSWORD'
if (-not $email -or -not $password) { throw "No superuser credentials in $envFile" }

$auth = Invoke-RestMethod -Method Post -Uri "$LocalPb/api/collections/_superusers/auth-with-password" `
        -ContentType 'application/json' -Body (@{ identity = $email; password = $password } | ConvertTo-Json)
$hdr = @{ Authorization = $auth.token }

$name = "migrate_$(Get-Date -Format 'yyyyMMdd_HHmmss').zip"
Invoke-RestMethod -Method Post -Uri "$LocalPb/api/backups" -Headers $hdr `
  -ContentType 'application/json' -Body (@{ name = $name } | ConvertTo-Json) | Out-Null

$zip = Join-Path ([System.IO.Path]::GetTempPath()) $name
$dl  = Invoke-RestMethod -Method Post -Uri "$LocalPb/api/files/token" -Headers $hdr
Invoke-WebRequest -Uri "$LocalPb/api/backups/$name`?token=$($dl.token)" -OutFile $zip
$zipMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "    $name  ($zipMB MB)" -ForegroundColor DarkGray

# -- 2. The key goes FIRST --------------------------------------------------
if (-not (Test-Path $keyPath)) {
  throw "No $keyPath. Settings encryption is on; without the key the remote PocketBase will not start against this backup."
}
$key = (Get-Content $keyPath -Raw).Trim()
Write-Host "==> shipping the settings-encryption key" -ForegroundColor Cyan
"PB_ENCRYPTION_KEY=$key" | ssh @sshArgs $SshTarget "cat > ~/.env.pocketbase && chmod 600 ~/.env.pocketbase && echo 'key installed'"
if ($LASTEXITCODE -ne 0) { throw "could not install the encryption key" }

# -- 3. Ship and restore ----------------------------------------------------
Write-Host "==> shipping the backup" -ForegroundColor Cyan
scp -i $KeyFile -P $SshPort -o StrictHostKeyChecking=accept-new $zip "${SshTarget}:~/pb-migrate.zip"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

$remote = @'
set -euo pipefail
cd ~/public_html

# Stop whatever is serving pb_data. Restoring underneath a live SQLite is how
# you get a database that passes every check today and is wrong next week.
if [ -f pb.pid ] && kill -0 "$(cat pb.pid)" 2>/dev/null; then kill "$(cat pb.pid)"; sleep 3; fi
pkill -f 'pocketbase serve' 2>/dev/null || true
sleep 2

# Keep the outgoing pb_data next to the new one rather than deleting it. Disk
# is 1.5-5 GiB and pb_data is ~15 MB; an undo is worth 15 MB.
if [ -d pb_data ]; then mv pb_data "pb_data.replaced.$(date +%Y%m%d%H%M%S)"; fi
mkdir -p pb_data
unzip -oq ~/pb-migrate.zip -d pb_data
rm -f ~/pb-migrate.zip pb.pid
ls -la pb_data | head
echo "restored"
'@
$remote | ssh @sshArgs $SshTarget 'bash -s'
if ($LASTEXITCODE -ne 0) { throw "remote restore failed" }

Write-Host "==> restarting the remote PocketBase" -ForegroundColor Cyan
# Kit variant starts a daemon; Passenger variant spawns on the next request.
ssh @sshArgs $SshTarget 'test -x ~/public_html/pb-run.sh && bash ~/public_html/pb-run.sh || echo "passenger variant: will spawn on first request"'

# -- 4. Read it back --------------------------------------------------------
Write-Host "==> reading the restored ledger back over HTTPS" -ForegroundColor Cyan
Start-Sleep -Seconds 5
try {
  $health = Invoke-RestMethod -Uri "https://$PbHost/api/health" -TimeoutSec 30
  Write-Host "    /api/health: $($health.message)" -ForegroundColor DarkGray
  $rauth = Invoke-RestMethod -Method Post -Uri "https://$PbHost/api/collections/_superusers/auth-with-password" `
           -ContentType 'application/json' -Body (@{ identity = $email; password = $password } | ConvertTo-Json)
  $nodes = Invoke-RestMethod -Uri "https://$PbHost/api/collections/nodes/records?perPage=1" -Headers @{ Authorization = $rauth.token }
  Write-Host "==> VERIFIED: $($nodes.totalItems) nodes readable from https://$PbHost" -ForegroundColor Green
} catch {
  Write-Host "==> The restore completed but the read-back FAILED: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "    Check ~/logs/pocketbase.log on the host. The most likely cause is a missing" -ForegroundColor Red
  Write-Host "    or wrong PB_ENCRYPTION_KEY, which makes PocketBase exit instead of start." -ForegroundColor Red
  Write-Host "    Your laptop's pb_data is untouched -- the rollback is to point POCKETBASE_URL back at it." -ForegroundColor Yellow
  exit 1
}

Remove-Item $zip -Force
