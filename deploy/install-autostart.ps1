# HoneyMoney — install auto-start (run ELEVATED / as admin).
#
# honeymoney.app is served straight off this machine, so "is the site up?" is
# really "is this machine up, and did the stack come back?". This registers ONE
# scheduled task that answers yes in all three cases:
#
#   AtStartup  — the site returns after a reboot even if nobody signs in.
#                A forced 3am Windows Update reboot used to leave the site dark
#                at the lock screen until someone logged in.
#   AtLogOn    — covers a normal sign-in.
#   every 5min — watchdog. start-honeymoney.ps1 is idempotent, so this is a
#                no-op when all three components are healthy and a self-heal
#                when one has died.
#
# LogonType S4U runs the task without an interactive session AND without storing
# a password — which is what makes the AtStartup trigger work at all.
$ErrorActionPreference = 'Stop'
$log = 'C:\2026_honeymoney\deploy\autostart-install.log'
"=== HoneyMoney autostart install $(Get-Date -Format o) ===" | Set-Content $log

try {
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\2026_honeymoney\deploy\start-honeymoney.ps1"'

  $atStartup = New-ScheduledTaskTrigger -AtStartup
  $atLogon   = New-ScheduledTaskTrigger -AtLogOn

  # Repetition is what turns the task into a watchdog. It has to be attached to a
  # trigger, and MaxValue means "indefinitely".
  foreach ($t in @($atStartup, $atLogon)) {
    $t.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
      -RepetitionInterval (New-TimeSpan -Minutes 5) `
      -RepetitionDuration ([TimeSpan]::MaxValue)).Repetition
  }

  $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U -RunLevel Highest

  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

  Register-ScheduledTask -TaskName 'HoneyMoney' -Action $action -Trigger @($atStartup, $atLogon) `
    -Principal $principal -Settings $settings `
    -Description 'Serve honeymoney.app: start PocketBase + Next.js + Cloudflare Tunnel at boot and at logon, and re-check every 5 minutes.' `
    -Force | Out-Null

  "OK: task 'HoneyMoney' registered (boot + logon + 5-min watchdog, S4U)." | Add-Content $log
} catch {
  "FAIL task: $($_.Exception.Message)" | Add-Content $log
  throw
}

# The tunnel is started by the task above, NOT by `cloudflared service install`.
# An earlier version tried both; the service half-registered and, had it ever
# come up, two connectors would have raced on the same tunnel. One owner only.

"=== done $(Get-Date -Format o) ===" | Add-Content $log
Get-Content $log
