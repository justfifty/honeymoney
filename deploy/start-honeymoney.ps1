# HoneyMoney — start the full public stack (PocketBase + Next.js app + Cloudflare Tunnel).
#
# Run by the "HoneyMoney" scheduled task at boot, at logon, and then every few
# minutes as a watchdog. Every step is idempotent — it only starts a component
# that isn't already listening — so re-running it is free and a crashed piece
# comes back on the next tick without anyone noticing.
#
# Paths are absolute on purpose: the task also runs before logon (S4U), where
# $env:USERPROFILE is not what you'd expect.
$ErrorActionPreference = 'SilentlyContinue'

$web      = 'C:\2026_honeymoney\web'
$pb       = 'C:\2026_honeymoney\pocketbase'
$cfConfig = 'C:\Users\young\.cloudflared\config.yml'
$logDir   = 'C:\2026_honeymoney\deploy\logs'

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'stack.log'

function Note($msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Add-Content $log
}

function Listening($port) {
  [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

# Keep the log from growing without bound across months of 5-minute ticks.
if ((Get-Item $log -ErrorAction SilentlyContinue).Length -gt 2MB) {
  Move-Item $log "$log.old" -Force
}

# 0) A requested PocketBase restart, to apply pending migrations.
#
# PocketBase runs its pending migrations at startup, so a new file in
# pb_migrations does nothing until the process comes back. It cannot be brought
# back by hand: this task runs elevated and PocketBase inherits that, so a
# Stop-Process from an ordinary shell gets "Access is denied" — the same wall
# the app hit on 2026-08-22.
#
# Deliberately a MARKER rather than "restart whenever a migration file is newer
# than the process". Applying a schema change is a decision someone makes, not
# something a 5-minute timer should do the moment a file lands on disk — and
# dropping the marker is the moment that decision is recorded. It is also the
# cue to have taken a backup: run deploy/backup-pocketbase.ps1 first.
#
#   New-Item C:\2026_honeymoney\deploy\.restart-pocketbase -ItemType File
#   schtasks /run /tn HoneyMoney
#
# The marker is consumed whether or not the stop succeeds, so a failure cannot
# leave the watchdog restarting the database every five minutes forever.
$marker = 'C:\2026_honeymoney\deploy\.restart-pocketbase'
if (Test-Path $marker) {
  Note 'restart marker present -> restarting PocketBase to apply migrations'
  Remove-Item $marker -Force -ErrorAction SilentlyContinue
  $conn = Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}

# 1) PocketBase on 127.0.0.1:8090 — localhost only, never exposed through the tunnel.
#
# --encryptionEnv encrypts the SETTINGS block inside data.db. That matters
# specifically because of R2: the S3 credentials for off-machine backups live in
# those settings, and data.db is the file being uploaded. Without this, every
# backup sitting in the bucket contains the keys to that same bucket.
#
# The key is read from deploy/.pb-encryption-key (gitignored) and passed as an
# environment variable to the child process only — never on the command line,
# where it would be visible to anything that can list processes.
#
# If the key file is missing, PocketBase starts WITHOUT encryption rather than
# not starting at all. A site that is up with unencrypted settings is a smaller
# problem than a site that is down, and the log line says which happened.
if (-not (Listening 8090)) {
  $keyFile = 'C:\2026_honeymoney\deploy\.pb-encryption-key'
  $pbArgs = @('serve', '--http=127.0.0.1:8090')
  if (Test-Path $keyFile) {
    $key = (Get-Content $keyFile -Raw).Trim()
    if ($key.Length -eq 32) {
      $env:PB_ENCRYPTION_KEY = $key
      $pbArgs += '--encryptionEnv=PB_ENCRYPTION_KEY'
      Note 'PocketBase not listening -> starting (settings encrypted)'
    } else {
      Note "PocketBase key file is $($key.Length) chars, expected 32 -> starting WITHOUT encryption"
    }
  } else {
    Note 'PocketBase not listening -> starting (no key file; settings NOT encrypted)'
  }
  Start-Process -WindowStyle Hidden -WorkingDirectory $pb `
    -FilePath (Join-Path $pb 'pocketbase.exe') -ArgumentList $pbArgs
  Start-Sleep -Seconds 2
}

# 2) Next.js production server on port 3000.
#
# A running `next start` holds the build it booted with, so `npm run build`
# alone changes nothing a visitor sees: the old server keeps serving the old
# pages. Found the hard way on 2026-08-22 — the site returned 200 throughout and
# the landing page still rendered a button that had been deleted an hour before.
#
# It cannot be fixed from an ordinary shell either. This task runs elevated
# (RunLevel Highest) and the app inherits that, so a hand-run stop-honeymoney.ps1
# gets "Access is denied" on every Stop-Process — and says nothing, because the
# script is SilentlyContinue. A deploy therefore *appears* to succeed.
#
# So the restart belongs here, where the privileges already are: if the build on
# disk is newer than the process serving it, that process is stale.
function AppProcess {
  $c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $c) { return $null }
  Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess) -ErrorAction SilentlyContinue
}

$app     = AppProcess
$buildId = Join-Path $web '.next\BUILD_ID'
if ($app -and (Test-Path $buildId)) {
  $built = (Get-Item $buildId).LastWriteTime
  # The 60-second settling window matters: `next build` writes BUILD_ID while it
  # is still emitting chunks, and restarting into a half-written .next serves a
  # broken app. A deploy is never in such a hurry that a minute costs anything.
  if ($built -gt $app.CreationDate -and $built -lt (Get-Date).AddSeconds(-60)) {
    Note ("stale build: server up since {0:HH:mm:ss}, build written {1:HH:mm:ss} -> restarting" -f $app.CreationDate, $built)
    # The npm.cmd wrapper goes first, or it can outlive the server it launched.
    $parent = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $app.ParentProcessId) -ErrorAction SilentlyContinue
    if ($parent -and $parent.Name -match '^(npm|node|cmd)') {
      Stop-Process -Id $parent.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $app.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
}

if (-not (Listening 3000)) {
  Note 'app not listening -> starting'
  Start-Process -WindowStyle Hidden -WorkingDirectory $web `
    -FilePath 'npm.cmd' -ArgumentList 'run','start'
}

# 3) Cloudflare Tunnel -> publishes port 3000 at honeymoney.app.
#    --logfile matters: without it cloudflared runs hidden and silent, and a
#    tunnel that flaps at 3am leaves no evidence at all to diagnose from.
if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
  Note 'cloudflared not running -> starting'
  Start-Process -WindowStyle Hidden -FilePath 'cloudflared' -ArgumentList @(
    'tunnel','--config',$cfConfig,
    '--loglevel','info',
    '--logfile',(Join-Path $logDir 'cloudflared.log'),
    'run','honeymoney'
  )
}
