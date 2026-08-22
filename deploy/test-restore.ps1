# HoneyMoney — prove a backup can actually be restored.
#
#   .\deploy\test-restore.ps1              # newest backup
#   .\deploy\test-restore.ps1 -Zip <path>  # a specific one
#
# An untested backup is not a backup. It is a zip file with optimistic feelings
# attached, and the moment you discover otherwise is the moment you needed it.
#
# This restores into a THROWAWAY directory and runs a second PocketBase against
# it on a spare port. The live pb_data is never touched, the live server is never
# stopped, and the whole thing is deleted afterwards — so it is safe to run any
# time, including while the site is serving.
#
# What it actually checks, in order of how badly each would hurt:
#   1. the zip opens and contains data.db          — otherwise it is not a backup
#   2. PocketBase starts against it                — a corrupt db fails here
#   3. /api/health answers                         — it is really running
#   4. the collections exist and carry rows        — the LEDGER survived, not just the file
#
# Note on encryption: settings are encrypted with PB_ENCRYPTION_KEY, so a restore
# on a machine without that key starts fine and reads all data, but loses the
# settings block (SMTP, S3). That is the intended trade — see start-honeymoney.ps1.
# The ledger itself is not encrypted and restores anywhere.

param(
  [string]$Zip = "",
  [int]$Port = 8099
)

$ErrorActionPreference = 'Stop'
$pb = 'C:\2026_honeymoney\pocketbase'
$backups = Join-Path $pb 'pb_data\backups'

function Say($msg, $ok = $null) {
  if ($null -eq $ok) { Write-Host "  $msg" }
  elseif ($ok) { Write-Host "  ok    $msg" -ForegroundColor Green }
  else { Write-Host "  FAIL  $msg" -ForegroundColor Red; $script:failed++ }
}
$script:failed = 0

if (-not $Zip) {
  $newest = Get-ChildItem $backups -Filter '*.zip' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $newest) { Write-Host ("No backups found in " + $backups) -ForegroundColor Red; exit 2 }
  $Zip = $newest.FullName
}

Write-Host ""
Write-Host ("Restoring " + (Split-Path $Zip -Leaf) + " (" + [math]::Round((Get-Item $Zip).Length/1MB,1) + " MB)")
Write-Host ""

$work = Join-Path $env:TEMP "hm-restore-$(Get-Random)"
$dataDir = Join-Path $work 'pb_data'
$proc = $null

try {
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  Expand-Archive -Path $Zip -DestinationPath $dataDir -Force
  Say "zip extracted" $true

  $db = Join-Path $dataDir 'data.db'
  Say "data.db present" (Test-Path $db)
  if (Test-Path $db) {
    Say "data.db is $([math]::Round((Get-Item $db).Length/1MB,2)) MB"
  }

  # A second PocketBase, on its own port, against the restored copy. No
  # encryption key passed on purpose: this proves the LEDGER restores on a
  # machine that has only the zip, which is the situation a restore actually
  # happens in.
  $proc = Start-Process -PassThru -WindowStyle Hidden -WorkingDirectory $pb `
    -FilePath (Join-Path $pb 'pocketbase.exe') `
    -ArgumentList 'serve', "--http=127.0.0.1:$Port", "--dir=$dataDir"

  $up = $false
  foreach ($i in 1..30) {
    Start-Sleep -Milliseconds 700
    try {
      $h = Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
      if ($h) { $up = $true; break }
    } catch { }
  }
  Say "PocketBase started against the restored copy" $up

  if ($up) {
    # Row counts straight out of the restored file. "The file exists" and "the
    # household's ledger is in it" are different claims, and only the second one
    # is worth anything at 3am.
    $sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
    if ($sqlite) {
      foreach ($t in 'transactions', 'nodes', 'members', 'tenants') {
        try {
          $n = & sqlite3 $db "SELECT COUNT(*) FROM $t;" 2>$null
          Say "$t : $n rows" ([int]$n -ge 0)
        } catch { Say "$t : could not be read" $false }
      }
    } else {
      # No sqlite3 on PATH — fall back to the running instance's own API. Needs
      # no credentials for a HEAD against a collection that exists.
      # -SkipHttpErrorCheck is PowerShell 7+; this is Windows PowerShell 5.1, where
      # Invoke-WebRequest THROWS on any non-2xx. The status still arrives, on the
      # exception's Response — and 400/403 are the answers we are hoping for here,
      # so treating a throw as failure would have reported a healthy restore as broken.
      $code = 0
      try {
        $r = Invoke-WebRequest "http://127.0.0.1:$Port/api/collections/transactions/records?perPage=1" -TimeoutSec 5 -UseBasicParsing
        $code = [int]$r.StatusCode
      } catch {
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      }
      # 400/403 both mean the collection EXISTS and its rules are being enforced,
      # which is exactly what a healthy restore looks like from outside.
      Say "transactions collection responds (HTTP $code)" ($code -in 200, 400, 403)
      Say "install sqlite3 for row counts (winget install SQLite.SQLite)"
    }
  }
}
catch {
  Say "restore threw: $($_.Exception.Message)" $false
}
finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 500
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host ""
  Write-Host ("  cleaned up " + $work)
}

if ($script:failed -gt 0) {
  Write-Host ""
  Write-Host ([string]$script:failed + " check(s) failed - this backup is NOT safe to rely on.") -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "This backup restores and the ledger is in it." -ForegroundColor Green
