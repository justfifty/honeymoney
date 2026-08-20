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
#   -Task demo    node scripts/refresh-demo-data.mjs (roll the seeded demo
#                 personas into the current month; real households untouched)
#
# If the secret is unset, or Telegram is unconfigured for nudges, the endpoint
# simply no-ops — this script is always safe to schedule.
param(
  [ValidateSet('purge', 'nudge', 'demo')]
  [string]$Task = 'purge'
)
$ErrorActionPreference = 'Stop'

$envFile = 'C:\2026_honeymoney\web\.env.local'
$logDir = 'C:\2026_honeymoney\deploy\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'maintenance.log'
function Note($m) { "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  [$Task] $m" | Add-Content $log }

if (-not (Test-Path $envFile)) { Note "web/.env.local not found — skipping."; exit 0 }

# The demo refresh talks to PocketBase directly, not to a secured HTTP route, so
# it needs neither the purge secret nor the Next.js server to be up. Schedule it
# monthly: the seeds stamp absolute dates, so without it every month-to-date view
# on the public showcase eventually renders an empty month.
if ($Task -eq 'demo') {
  try {
    Push-Location 'C:/2026_honeymoney/web'
    # No 2>&1 here: with $ErrorActionPreference='Stop', redirecting a native
    # command's stderr in PS 5.1 wraps each line in a NativeCommandError and
    # throws even when node exits 0.
    $out = & node --env-file=.env.local ../scripts/refresh-demo-data.mjs
    if ($LASTEXITCODE -ne 0) { throw "refresh-demo-data.mjs exited $LASTEXITCODE" }
    Note ("ok: " + ($out -join ' | '))
  } catch {
    Note ("FAIL: " + $_.Exception.Message)
  } finally {
    Pop-Location
  }
  exit 0
}

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
