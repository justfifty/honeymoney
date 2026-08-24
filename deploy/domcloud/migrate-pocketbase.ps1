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

# .pbhost, NOT .host. There are two sites and they are not interchangeable:
# .host is the APP site, which push-build.ps1 extracts a Next.js bundle into,
# and .pbhost is the PocketBase site, which this script overwrites pb_data on.
# They were briefly the same file, which meant whichever script ran second was
# aimed at the wrong host — restoring a household ledger over the web app, or
# unpacking the web app over the ledger. Separate files, and no cross-fallback:
# guessing the target of a destructive operation is not a convenience.
if (-not $SshTarget) {
  $hostFile = Join-Path $PSScriptRoot '.pbhost'
  if (Test-Path $hostFile) { $SshTarget = (Get-Content $hostFile -Raw).Trim() }
}
if (-not $SshTarget) { throw "No SSH target. Pass -SshTarget user@host or write $PSScriptRoot\.pbhost (the PocketBase site — NOT .host, which is the app)." }

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

# Windows OpenSSH refuses a private key whose ACL lets anyone else read it, and
# a file created in a repo folder inherits exactly such an ACL. It then falls
# back to asking for a PASSWORD, which in a non-interactive run means hanging
# until something times out rather than failing. Git Bash's ssh does not check
# this, so the same key can work from one shell and be rejected in another.
# Repairing it is idempotent and costs nothing when already correct.
if (Test-Path $KeyFile) {
  $acl = (icacls $KeyFile) -join ' '
  if ($acl -match 'BUILTIN\\Users|Authenticated Users|Everyone') {
    Write-Host "==> tightening ACL on $KeyFile (was readable by others)" -ForegroundColor Cyan
    icacls $KeyFile /inheritance:r  | Out-Null
    icacls $KeyFile /grant:r "$($env:USERNAME):(R)" | Out-Null
  }
}

# PowerShell's pipeline emits UTF-8 WITH a BOM, and `"text" | ssh 'cat > file'`
# therefore writes EF BB BF ahead of the first character. It broke this script
# in two places on the first real migration:
#   • ~/.env.pocketbase became "﻿PB_ENCRYPTION_KEY=...", so the variable
#     the shell defined was named ﻿PB_ENCRYPTION_KEY, PB_ENCRYPTION_KEY was
#     empty, pb-start.sh omitted --encryptionEnv, and PocketBase refused to open
#     the encrypted pb_data. The restore was fine; it just could not be opened.
#   • the restore script piped to `bash -s` began "﻿set -euo pipefail",
#     which bash reported as "set: command not found" and carried on WITHOUT
#     error handling — during the one operation that most needs it.
# So: write with an explicit BOM-less encoder and scp the file, never pipe it.
function Copy-TextNoBom([string]$Content, [string]$RemotePath) {
  $tmp = [IO.Path]::GetTempFileName()
  try {
    [IO.File]::WriteAllText($tmp, $Content, (New-Object System.Text.UTF8Encoding $false))
    $bytes = [IO.File]::ReadAllBytes($tmp)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
      throw "refusing to ship a file that still starts with a BOM"
    }
    scp -i $KeyFile -P $SshPort -o StrictHostKeyChecking=accept-new $tmp "${SshTarget}:$RemotePath"
    if ($LASTEXITCODE -ne 0) { throw "scp of $RemotePath failed" }
  } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
}

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
Copy-TextNoBom "PB_ENCRYPTION_KEY=$key`n" '~/.env.pocketbase'
# Prove the remote shell can actually READ the variable back, rather than
# assuming the file arrived intact. An unreadable key is indistinguishable from
# a missing one at PocketBase startup, and both are silent until the 500.
$keyLen = (ssh @sshArgs $SshTarget 'chmod 600 ~/.env.pocketbase; set -a; . ~/.env.pocketbase; set +a; printf %s "${#PB_ENCRYPTION_KEY}"')
if ($LASTEXITCODE -ne 0) { throw "could not install the encryption key" }
if ([int]$keyLen -lt 1) { throw "the encryption key did not survive the trip: the remote shell reads PB_ENCRYPTION_KEY as empty (length $keyLen). Ship it again before restoring, or the restored pb_data cannot be opened." }
Write-Host "    key installed and readable ($keyLen chars)" -ForegroundColor DarkGray

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
Copy-TextNoBom $remote '~/pb-restore.sh'
ssh @sshArgs $SshTarget 'bash ~/pb-restore.sh; rc=$?; rm -f ~/pb-restore.sh; exit $rc'
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
