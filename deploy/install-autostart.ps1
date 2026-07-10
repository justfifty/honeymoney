# HoneyMoney — install auto-start (run ELEVATED / as admin).
# 1) Registers a logon scheduled task that starts PocketBase + the app + tunnel.
# 2) Installs cloudflared as a boot service so the tunnel is up even before logon.
$log = 'C:\2026_honeymoney\deploy\autostart-install.log'
"=== HoneyMoney autostart install $(Get-Date -Format o) ===" | Set-Content $log

# --- 1) logon scheduled task -------------------------------------------------
try {
  $action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\2026_honeymoney\deploy\start-honeymoney.ps1"'
  $trigger  = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName 'HoneyMoney' -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Start HoneyMoney public stack (PocketBase + Next.js + Cloudflare Tunnel) at logon' -Force -ErrorAction Stop | Out-Null
  "OK: scheduled task 'HoneyMoney' registered (runs at logon)." | Add-Content $log
} catch {
  "FAIL task: $($_.Exception.Message)" | Add-Content $log
}

# --- 2) cloudflared as a boot service ---------------------------------------
try {
  $out = & cloudflared --config "C:\Users\young\.cloudflared\config.yml" service install 2>&1
  ($out | Out-String) | Add-Content $log
  "OK: cloudflared service install attempted." | Add-Content $log
} catch {
  "FAIL cloudflared service: $($_.Exception.Message)" | Add-Content $log
}

"=== done $(Get-Date -Format o) ===" | Add-Content $log
