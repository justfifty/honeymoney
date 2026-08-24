# HoneyMoney - register the on-demand restart task. RUN THIS ONCE, ELEVATED.
#
# WHY IT NEEDS ELEVATION, and why that is not an oversight. The "HoneyMoney"
# task launches the stack as young with RunLevel=Highest. Windows will not let a
# non-elevated process signal those, nor register a new task that claims the
# same RunLevel -- both fail with "Access is denied". So the one-time install is
# elevated; every restart afterwards is not, because Start-ScheduledTask only
# asks the scheduler to run something it already trusts.
#
#   Right-click PowerShell -> Run as administrator, then:
#     powershell -ExecutionPolicy Bypass -File C:\2026_honeymoney\deploy\install-restart-task.ps1
#
#   After that, from any ordinary shell:
#     Start-ScheduledTask -TaskName HoneyMoney-Restart
#
# WHAT IT IS FOR. start-honeymoney.ps1 is idempotent and port-guarded, so it
# will not pick up a changed web/.env.local -- it sees port 3000 answering and
# does nothing. Any environment change (AI_SECRETS_KEY, POCKETBASE_URL,
# AI_PROVIDER) needs a real restart, and this is the only handle that has the
# privilege to perform one.
[CmdletBinding()]
param([string]$UserId = $env:USERNAME)

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host @"
This must run elevated.

Registering a task with RunLevel=Highest is itself a privileged operation, and
without it the task could not stop processes the HoneyMoney task started.
Re-run from an administrator PowerShell:

  powershell -ExecutionPolicy Bypass -File $PSCommandPath
"@ -ForegroundColor Yellow
  exit 1
}

$script = Join-Path $PSScriptRoot 'restart-honeymoney.ps1'
if (-not (Test-Path $script)) { throw "missing $script" }

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""

# Same principal as the HoneyMoney start task on purpose: a restart task that
# cannot stop what the start task started is decoration.
$principal = New-ScheduledTaskPrincipal -UserId $UserId -LogonType S4U -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

# No trigger: this runs when asked and never on its own. A restart on a timer
# would be an outage on a timer.
Register-ScheduledTask -TaskName 'HoneyMoney-Restart' -Action $action `
  -Principal $principal -Settings $settings -Force `
  -Description 'On-demand restart of the HoneyMoney stack. Same elevated principal as the HoneyMoney start task, because a non-elevated stop reports success without stopping anything.' | Out-Null

Write-Host "registered HoneyMoney-Restart" -ForegroundColor Green
Write-Host "restart the stack any time with:  Start-ScheduledTask -TaskName HoneyMoney-Restart"
