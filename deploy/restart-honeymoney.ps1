# HoneyMoney - stop the stack and start it again, from a context that can.
#
# WHY THIS EXISTS. start-honeymoney.ps1 is idempotent and port-guarded, which is
# right for a watchdog and useless for picking up a changed environment: it sees
# port 3000 answering and does nothing. And stop-honeymoney.ps1 run from an
# ordinary shell reports "HoneyMoney stack stopped" while the processes keep
# running, because the scheduled task "HoneyMoney" launches them as young with
# RunLevel=Highest, and a non-elevated Stop-Process against those gets
# "Access is denied".
#
# The two together are worse than either alone: the stack looks restarted, the
# site keeps answering, and the new environment variable is silently absent.
# That is exactly how AI_SECRETS_KEY came to be set in web/.env.local for
# nineteen minutes while /setup still refused to store a household AI key.
#
# So this script does the obvious thing and the INSTALLER below makes it
# runnable from the right context:
#
#   powershell -File deploy\install-restart-task.ps1   # once
#   Start-ScheduledTask -TaskName HoneyMoney-Restart   # any time after
#
# Run directly (elevated) it also works; run directly unelevated it will tell
# you what it could not stop rather than claiming success.
[CmdletBinding()]
param([int]$WaitSeconds = 60)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$log  = Join-Path $PSScriptRoot 'logs\restart.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
function Note($m) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $m"
  $line | Add-Content $log
  Write-Host $line
}

Note "restart requested"

# Record what is holding the ports BEFORE, so the log can prove the PIDs changed
# rather than asserting a restart happened.
function PortOwner([int]$port) {
  $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return $c.OwningProcess }
  return 0
}
$before3000 = PortOwner 3000
$before8090 = PortOwner 8090
Note "before: port3000=pid$before3000 port8090=pid$before8090"

& (Join-Path $PSScriptRoot 'stop-honeymoney.ps1')

# stop-honeymoney.ps1 is best-effort. Verify, and say so plainly if a process
# survived -- a restart that silently did not restart is the failure this whole
# script exists because of.
Start-Sleep -Seconds 3
$stuck = @()
foreach ($p in 3000, 8090) {
  $owner = PortOwner $p
  if ($owner -ne 0) {
    try {
      Stop-Process -Id $owner -Force -ErrorAction Stop
      Note "force-stopped pid $owner on port $p"
    } catch {
      $stuck += "port $p held by pid $owner ($($_.Exception.Message))"
    }
  }
}
if ($stuck.Count -gt 0) {
  Note "FAIL: could not stop: $($stuck -join '; ')"
  Note "Run this via the HoneyMoney-Restart scheduled task, which has the same"
  Note "principal (young / RunLevel=Highest) as the task that started them."
  exit 1
}

Start-Sleep -Seconds 2
& (Join-Path $PSScriptRoot 'start-honeymoney.ps1')

# Wait for both to answer, then confirm the PIDs are genuinely new.
$deadline = (Get-Date).AddSeconds($WaitSeconds)
do {
  Start-Sleep -Seconds 3
  $app = try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/' -TimeoutSec 8).StatusCode } catch { 0 }
  $pb  = try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8090/api/health' -TimeoutSec 8).StatusCode } catch { 0 }
} while ((($app -ne 200) -or ($pb -ne 200)) -and ((Get-Date) -lt $deadline))

$after3000 = PortOwner 3000
$after8090 = PortOwner 8090
Note "after:  port3000=pid$after3000 port8090=pid$after8090  app=$app pocketbase=$pb"

if ($app -ne 200 -or $pb -ne 200) { Note "FAIL: stack did not come back within ${WaitSeconds}s"; exit 1 }
if ($after3000 -eq $before3000 -and $before3000 -ne 0) {
  Note "FAIL: port 3000 is still the same process ($after3000). Nothing was restarted."
  exit 1
}
Note "restart complete"
