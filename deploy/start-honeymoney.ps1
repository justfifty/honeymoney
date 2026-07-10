# HoneyMoney — start the full public stack (PocketBase + Next.js app + Cloudflare Tunnel).
# Run by the "HoneyMoney" scheduled task at logon, so the site comes back after a reboot.
# Idempotent: each piece only starts if it isn't already running.
$ErrorActionPreference = 'SilentlyContinue'

$web      = 'C:\2026_honeymoney\web'
$pb       = 'C:\2026_honeymoney\pocketbase'
$cfConfig = Join-Path $env:USERPROFILE '.cloudflared\config.yml'

# 1) PocketBase on 127.0.0.1:8090 (localhost only — never exposed)
if (-not (Get-NetTCPConnection -LocalPort 8090 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -WindowStyle Hidden -WorkingDirectory $pb `
    -FilePath (Join-Path $pb 'pocketbase.exe') -ArgumentList 'serve','--http=127.0.0.1:8090'
  Start-Sleep -Seconds 2
}

# 2) Next.js production server on port 3000
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  Start-Process -WindowStyle Hidden -WorkingDirectory $web `
    -FilePath 'npm.cmd' -ArgumentList 'run','start'
}

# 3) Cloudflare Tunnel → publishes port 3000 at honeymoney.app
if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
  Start-Process -WindowStyle Hidden `
    -FilePath 'cloudflared' -ArgumentList 'tunnel','--config',$cfConfig,'run','honeymoney'
}

Write-Output "HoneyMoney stack start requested (PocketBase :8090, app :3000, tunnel -> honeymoney.app)."
