# HoneyMoney — scheduled maintenance runner.
#
# Calls the local server's secured maintenance endpoints. Runs on this machine,
# so it hits 127.0.0.1:3000 directly (no tunnel) and authenticates with the
# ACCOUNT_PURGE_SECRET read from web/.env.local — the same secret the routes
# check in the `x-purge-secret` header.
#
#   -Task purge   POST /api/account/purge-expired   (hard-delete accounts whose
#                 30-day grace window has elapsed)
#   -Task nudge   POST /api/insight/nudge           (proactive Honey nudges to
#                 households heading over/at-risk this month, via Telegram)
#
# If the secret is unset, or Telegram is unconfigured for nudges, the endpoint
# simply no-ops — this script is always safe to schedule.
param(
  [ValidateSet('purge', 'nudge')]
  [string]$Task = 'purge'
)
$ErrorActionPreference = 'Stop'

$envFile = 'C:\2026_honeymoney\web\.env.local'
$logDir = 'C:\2026_honeymoney\deploy\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'maintenance.log'
function Note($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  [$Task] $m" | Add-Content $log }

if (-not (Test-Path $envFile)) { Note "web/.env.local not found — skipping."; exit 0 }

$line = Select-String -Path $envFile -Pattern '^\s*ACCOUNT_PURGE_SECRET\s*=\s*(.+?)\s*$' | Select-Object -First 1
$secret = if ($line) { $line.Matches.Groups[1].Value.Trim().Trim('"').Trim("'") } else { '' }
if ([string]::IsNullOrWhiteSpace($secret)) {
  Note "ACCOUNT_PURGE_SECRET is empty — set it in web/.env.local to enable. Skipping."
  exit 0
}

$path = if ($Task -eq 'nudge') { '/api/insight/nudge' } else { '/api/account/purge-expired' }
try {
  $r = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000$path" `
    -Headers @{ 'x-purge-secret' = $secret } -TimeoutSec 180
  Note ("ok: " + ($r | ConvertTo-Json -Compress -Depth 5))
} catch {
  Note ("FAIL: " + $_.Exception.Message)
}
