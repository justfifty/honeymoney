# HoneyMoney — install the scheduled maintenance tasks (run ELEVATED / as admin).
#
# Registers three daily Windows scheduled tasks that call run-maintenance.ps1:
#   HoneyMoney-Purge  03:00 — permanently erase accounts past their 30-day grace
#   HoneyMoney-Demo   03:30 — roll the seeded demo personas into the current month
#
# Purge is a safe no-op until ACCOUNT_PURGE_SECRET is set in web/.env.local;
# Demo needs no secret and is a no-op whenever the personas are already current.
# S4U so they run without an interactive session and without storing a password.
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
  # Daily rather than monthly: it is idempotent and costs nothing on the days it
  # has nothing to do, and a daily run means the showcase can never be more than
  # 24h into a month with an empty month-to-date view.
  Register-Maintenance 'HoneyMoney-Demo' 'demo' '03:30' 'HoneyMoney: roll the seeded demo personas forward so month-to-date views are never empty.'
} catch {
  "FAIL: $($_.Exception.Message)" | Add-Content $log
  throw
}

"=== done $(Get-Date -Format o) ===" | Add-Content $log
Get-Content $log
