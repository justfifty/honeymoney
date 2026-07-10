# HoneyMoney — stop the public stack (tunnel + app + PocketBase).
$ErrorActionPreference = 'SilentlyContinue'
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
# stop node processes serving ports 3000 (Next) — match by listening port
foreach ($port in 3000,8090) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Get-Process pocketbase -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Output "HoneyMoney stack stopped."
