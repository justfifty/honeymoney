# HoneyMoney — install the scheduled maintenance tasks (run ELEVATED / as admin).
#
# Registers two daily Windows scheduled tasks that call run-maintenance.ps1:
#   HoneyMoney-Purge  03:00 — permanently erase accounts past their 30-day grace
#   HoneyMoney-Nudge  09:00 — send proactive Honey nudges (needs Telegram configured)
#
# Both are safe no-ops until ACCOUNT_PURGE_SECRET is set in web/.env.local. S4U so
# they run without an interactive session and without storing a password.
$ErrorActionPreference = 'Stop'
$log = 'C:\2026_honeymoney\deploy\maintenance-install.log'
"=== HoneyMoney maintenance install $(Get-Date -Format o) ===" | Set-Content $log

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew

function Register-Maintenance($name, $task, $at, $desc) {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"C:\2026_honeymoney\deploy\run-maintenance.ps1`" -Task $task"
  $trigger = New-ScheduledTaskTrigger -Daily -At $at
  Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Description $desc -Force | Out-Null
  "OK: $name ($task, daily at $at)" | Add-Content $log
}

try {
  Register-Maintenance 'HoneyMoney-Purge' 'purge' '03:00' 'HoneyMoney: erase accounts past their 30-day deletion grace window.'
  Register-Maintenance 'HoneyMoney-Nudge' 'nudge' '09:00' 'HoneyMoney: send proactive Honey nudges to at-risk households (Telegram).'
} catch {
  "FAIL: $($_.Exception.Message)" | Add-Content $log
  throw
}

"=== done $(Get-Date -Format o) ===" | Add-Content $log
Get-Content $log
