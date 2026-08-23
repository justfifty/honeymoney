# HoneyMoney - take a PocketBase backup now, and keep the last N.
#
# The nightly backup that PocketBase runs on its own cron only fires while this
# machine is on. This machine is off most of the week, so a cron-only schedule
# silently skips days. Running this at boot (and after any risky change)
# guarantees at least one backup per session.
#
# Where the backup LANDS is PocketBase's decision, not this script's:
#   Settings -> Backups -> Backup storage = local   -> pocketbase/pb_data/backups
#                                         = S3      -> the R2 bucket, off-machine
# Configure S3 once in the admin UI and this same script starts shipping to R2
# with no change here.
#
#   powershell -File deploy\backup-pocketbase.ps1
#   powershell -File deploy\backup-pocketbase.ps1 -Keep 30
param(
  [int]$Keep = 14,
  [string]$PbUrl = 'http://127.0.0.1:8090'
)
$ErrorActionPreference = 'Stop'

$envFile = 'C:\2026_honeymoney\web\.env.local'
$logDir  = 'C:\2026_honeymoney\deploy\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'backup.log'
function Note($m) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
  $line | Add-Content $log
  Write-Host $line
}

function EnvValue($key) {
  $m = Select-String -Path $envFile -Pattern "^\s*$key\s*=\s*(.+?)\s*$" | Select-Object -First 1
  if ($m) { return $m.Matches.Groups[1].Value.Trim().Trim('"').Trim("'") }
  return ''
}

if (-not (Test-Path $envFile)) { Note 'web/.env.local not found - skipping.'; exit 0 }

# PocketBase has to be up. At boot this script runs after start-honeymoney.ps1,
# but a cold SQLite open is not instant - give it a short grace period rather
# than failing a backup over two seconds.
#
# The gate follows $PbUrl instead of a fixed local port, because on the DOM
# Cloud LITE plan this script is the backup. Lite has no `docker` feature, so
# the 3-hour process cap applies and PocketBase runs under Passenger, stopped
# whenever it is idle - which means its OWN nightly cron cannot be relied on to
# fire. The laptop has to reach in and ask for the backup, at
# https://pb.honeymoney.app, and a localhost port check would have failed
# against a perfectly healthy host. It also ignored $PbUrl's port even locally.
$uri      = [Uri]$PbUrl
$deadline = (Get-Date).AddSeconds(60)
while ($true) {
  if ($uri.IsLoopback) {
    if (Get-NetTCPConnection -LocalPort $uri.Port -State Listen -ErrorAction SilentlyContinue) { break }
  } else {
    # Asking a stopped Passenger app for /api/health is what SPAWNS it, so a
    # slow first answer here is the mechanism working, not a failure.
    try { if ((Invoke-RestMethod -Method Get -TimeoutSec 45 -Uri "$PbUrl/api/health").code -eq 200) { break } } catch { }
  }
  if ((Get-Date) -gt $deadline) { Note "FAIL: PocketBase never answered at $PbUrl."; exit 1 }
  Start-Sleep -Seconds 3
}

$email    = EnvValue 'POCKETBASE_ADMIN_EMAIL'
$password = EnvValue 'POCKETBASE_ADMIN_PASSWORD'
if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
  Note 'POCKETBASE_ADMIN_EMAIL/PASSWORD not set in web/.env.local - skipping.'
  exit 0
}

try {
  $auth = Invoke-RestMethod -Method Post -TimeoutSec 30 `
    -Uri "$PbUrl/api/collections/_superusers/auth-with-password" `
    -ContentType 'application/json' `
    -Body (@{ identity = $email; password = $password } | ConvertTo-Json)
  $headers = @{ Authorization = $auth.token }

  # Named so the file sorts chronologically and says which machine made it.
  $name = "honeymoney_$(Get-Date -Format 'yyyyMMdd_HHmmss').zip"

  # Generous timeout: PocketBase checkpoints the WAL, zips pb_data and - when S3
  # is configured - uploads before it answers. On a slow uplink that is minutes,
  # and a timeout here would leave a half-written backup looking like a failure.
  Invoke-RestMethod -Method Post -TimeoutSec 900 -Uri "$PbUrl/api/backups" `
    -Headers $headers -ContentType 'application/json' `
    -Body (@{ name = $name } | ConvertTo-Json) | Out-Null
  Note "ok: created $name"

  # Prune. PocketBase's own "max keep" applies to its cron backups only; the
  # ones this script creates would otherwise accumulate forever.
  $all = (Invoke-RestMethod -Method Get -TimeoutSec 120 -Uri "$PbUrl/api/backups" -Headers $headers)
  $mine = @($all | Where-Object { $_.key -like 'honeymoney_*' } | Sort-Object key -Descending)
  if ($mine.Count -gt $Keep) {
    foreach ($old in $mine[$Keep..($mine.Count - 1)]) {
      Invoke-RestMethod -Method Delete -TimeoutSec 120 -Uri "$PbUrl/api/backups/$($old.key)" -Headers $headers | Out-Null
      Note "pruned $($old.key)"
    }
  }
  Note "held: $([Math]::Min($mine.Count, $Keep)) backup(s)"
} catch {
  Note ("FAIL: " + $_.Exception.Message)
  exit 1
}
