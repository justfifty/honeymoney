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

# 1) PocketBase on 127.0.0.1:8090 — localhost only, never exposed through the tunnel.
if (-not (Listening 8090)) {
  Note 'PocketBase not listening -> starting'
  Start-Process -WindowStyle Hidden -WorkingDirectory $pb `
    -FilePath (Join-Path $pb 'pocketbase.exe') -ArgumentList 'serve','--http=127.0.0.1:8090'
  Start-Sleep -Seconds 2
}

# 2) Next.js production server on port 3000.
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
