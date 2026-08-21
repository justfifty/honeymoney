# HoneyMoney - is the site actually resilient right now?
#
# Answers the only question that matters: "if this laptop dies, what survives?"
# Run it any time; it changes nothing. The one check that needs your attention is
# APEX FRONTED BY PAGES - until that is green, the laptop going down takes the
# whole site with it, snapshot or no snapshot.
$ErrorActionPreference = 'SilentlyContinue'

function Check($label, $ok, $detail) {
  $mark = if ($ok) { 'PASS' } else { 'FAIL' }
  $col  = if ($ok) { 'Green' } else { 'Red' }
  Write-Host ("  [{0}] {1}" -f $mark, $label) -ForegroundColor $col
  if ($detail) { Write-Host ("         {0}" -f $detail) -ForegroundColor DarkGray }
}

function Served($url) {
  try {
    $r = Invoke-WebRequest -Uri $url -Method Head -TimeoutSec 20 -UseBasicParsing
    $h = $r.Headers['X-HoneyMoney-Served']
    if ($h) { return $h } else { return 'origin' }
  } catch { return "ERR $($_.Exception.Message)" }
}

Write-Host "`n=== local stack (this machine) ===" -ForegroundColor Cyan
Check 'PocketBase listening on 8090' ([bool](Get-NetTCPConnection -LocalPort 8090 -State Listen)) $null
Check 'Next.js listening on 3000'    ([bool](Get-NetTCPConnection -LocalPort 3000 -State Listen)) $null
Check 'cloudflared running'          ([bool](Get-Process cloudflared)) $null

Write-Host "`n=== self-healing (survives reboot + crash) ===" -ForegroundColor Cyan
$t = Get-ScheduledTask -TaskName 'HoneyMoney'
$kinds = @($t.Triggers | ForEach-Object { $_.CimClass.CimClassName })
Check 'task exists'            ($null -ne $t) $null
Check 'starts at boot (no logon needed)' ($kinds -contains 'MSFT_TaskBootTrigger') 'without this the site stays dark after a 3am update reboot'
Check '5-minute watchdog'      ([bool]($t.Triggers | Where-Object { $_.Repetition.Interval -eq 'PT5M' })) 'restarts any component that dies'
Check 'runs without a session (S4U)' ($t.Principal.LogonType -eq 'S4U') $null
foreach ($n in 'HoneyMoney-Purge','HoneyMoney-Nudge','HoneyMoney-Demo') {
  Check "$n registered" ([bool](Get-ScheduledTask -TaskName $n)) $null
}

Write-Host "`n=== always-on edge (survives this machine being OFF) ===" -ForegroundColor Cyan
$apex = Served 'https://honeymoney.app/gallery'
Check 'APEX FRONTED BY PAGES' ($apex -eq 'edge-snapshot') `
  "honeymoney.app/gallery served by: $apex  (want 'edge-snapshot'; 'origin' = laptop-dependent)"
$dash = Served 'https://honeymoney.app/dashboard'
Check 'app routes reach the live origin' ($dash -eq 'origin') "/dashboard served by: $dash"
$pages = Served 'https://honeymoney-e84.pages.dev/gallery'
Check 'Pages snapshot deployed + healthy' ($pages -eq 'edge-snapshot') "pages.dev/gallery served by: $pages"

Write-Host "`nThe honest test: stop-honeymoney.ps1, then reload /, /guide, /gallery, /deck." -ForegroundColor Yellow
Write-Host "They must all still load, and /dashboard must show the offline page - not a 1033.`n" -ForegroundColor Yellow
