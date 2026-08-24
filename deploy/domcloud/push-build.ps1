<#
.SYNOPSIS
  Build the Next.js standalone bundle here and ship it to DOM Cloud.

.DESCRIPTION
  The app is built on this machine, not on the host. A host build would need
  node_modules (587 MB measured 2026-08-23) on a 1.5-5 GiB disk and would run
  again every time the platform re-ran a deploy. What ships instead is the
  standalone bundle: 34 MB measured, containing the server and only the modules
  it actually reaches.

  Builds into .next-dc, never .next. `next start` on this laptop serves out of
  .next, so building into it would take honeymoney.app down mid-build for a
  deploy that is not even for this machine.

.PARAMETER SshTarget
  user@host for the DOM Cloud site. Defaults to the contents of .host, so the
  hostname is written down once instead of being remembered every deploy.

.EXAMPLE
  ./push-build.ps1 -SshTarget honeymoney@sgp.domcloud.co
#>
[CmdletBinding()]
param(
  [string]$SshTarget,
  [int]$SshPort = 22,
  [string]$KeyFile = "$PSScriptRoot\id_domcloud",
  [switch]$SkipBuild,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repo  = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$web   = Join-Path $repo 'web'
$dist  = '.next-dc'

if (-not $SshTarget) {
  $hostFile = Join-Path $PSScriptRoot '.host'
  if (Test-Path $hostFile) { $SshTarget = (Get-Content $hostFile -Raw).Trim() }
}
# -DryRun builds and stages without shipping, so it needs neither of these.
# Checking them anyway would make the one mode that works before the account
# exists the one mode that refuses to run.
if (-not $DryRun) {
  if (-not $SshTarget) {
    throw "No SSH target. Pass -SshTarget user@host, or write it into $PSScriptRoot\.host"
  }
  if (-not (Test-Path $KeyFile)) {
    throw "No deploy key at $KeyFile. Generate one: ssh-keygen -t ed25519 -f `"$KeyFile`" -N `"`""
  }
}

# -- 1. Build ----------------------------------------------------------------
if (-not $SkipBuild) {
  Write-Host "==> building standalone bundle into web\$dist" -ForegroundColor Cyan
  Push-Location $web
  try {
    $env:NEXT_DIST_DIR = $dist
    # Opt in to the standalone bundle for THIS build only. It is off by default
    # because `next start` - how this laptop serves the live site - refuses to
    # run against a standalone build. See web/next.config.ts.
    $env:NEXT_STANDALONE = '1'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "next build failed ($LASTEXITCODE)" }
  } finally {
    Remove-Item Env:\NEXT_DIST_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:\NEXT_STANDALONE -ErrorAction SilentlyContinue
    Pop-Location
    # next build rewrites tsconfig.json's `include` while it runs. That edit is
    # noise from a deploy build and would otherwise show up as a dirty file.
    git -C $repo checkout -- web/tsconfig.json 2>$null
  }
}

$standalone = Join-Path $web "$dist\standalone"
if (-not (Test-Path (Join-Path $standalone 'server.js'))) {
  throw "No standalone output at $standalone. Did NEXT_STANDALONE reach next.config.ts?"
}

# -- 2. Stage ----------------------------------------------------------------
# Next.js standalone deliberately omits static assets: /_next/static and public/
# have to be laid in beside the server or every page renders unstyled. The inner
# directory is named after distDir, which is why $dist is threaded through here
# rather than hardcoded as ".next".
$stage = Join-Path ([System.IO.Path]::GetTempPath()) "hm-domcloud-$(Get-Random)"
Write-Host "==> staging in $stage" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item "$standalone\*" $stage -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $stage $dist) -Force | Out-Null
Copy-Item (Join-Path $web "$dist\static") (Join-Path $stage "$dist\static") -Recurse -Force
Copy-Item (Join-Path $web 'public')       (Join-Path $stage 'public')       -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot 'start-app.sh') $stage -Force

$sizeMB = [math]::Round((Get-ChildItem $stage -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "    bundle is $sizeMB MB" -ForegroundColor DarkGray

$tarball = Join-Path ([System.IO.Path]::GetTempPath()) 'hm-domcloud.tgz'
tar -czf $tarball -C $stage .
if ($LASTEXITCODE -ne 0) { throw "tar failed" }

if ($DryRun) {
  Write-Host "==> dry run: built and staged, nothing shipped. Tarball: $tarball" -ForegroundColor Yellow
  return
}

# -- 3. Ship -----------------------------------------------------------------
$sshArgs = @('-i', $KeyFile, '-p', $SshPort, '-o', 'StrictHostKeyChecking=accept-new')
Write-Host "==> shipping to $SshTarget" -ForegroundColor Cyan
scp -i $KeyFile -P $SshPort -o StrictHostKeyChecking=accept-new $tarball "${SshTarget}:~/hm-domcloud.tgz"
if ($LASTEXITCODE -ne 0) { throw "scp failed" }

# Extracted over the top rather than into an emptied directory: pb_data lives
# under public_html on the single-site layout, and rm -rf public_html/* would
# take the ledger with it.
$remote = @'
set -euo pipefail
mkdir -p ~/public_html
tar -xzf ~/hm-domcloud.tgz -C ~/public_html
rm -f ~/hm-domcloud.tgz
chmod +x ~/public_html/start-app.sh
mkdir -p ~/public_html/tmp && touch ~/public_html/tmp/restart.txt   # Passenger picks this up
echo "deployed: $(ls -1 ~/public_html | wc -l) entries in public_html"
'@
# NOT `$remote | ssh 'bash -s'`. PowerShell's pipeline emits UTF-8 WITH a BOM,
# so the first line arrives as "﻿set -euo pipefail" and bash answers
# "set: command not found" — then carries on WITHOUT error handling, which on a
# deploy means a half-extracted bundle reporting success. The same bug hit
# migrate-pocketbase.ps1 against the ledger. Write BOM-less and scp the file.
$scriptTmp = [IO.Path]::GetTempFileName()
try {
  [IO.File]::WriteAllText($scriptTmp, $remote, (New-Object System.Text.UTF8Encoding $false))
  $b = [IO.File]::ReadAllBytes($scriptTmp)
  if ($b.Length -ge 3 -and $b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) {
    throw "refusing to ship a script that still starts with a BOM"
  }
  scp -i $KeyFile -P $SshPort -o StrictHostKeyChecking=accept-new $scriptTmp "${SshTarget}:~/hm-extract.sh"
  if ($LASTEXITCODE -ne 0) { throw "scp of the extract script failed" }
} finally { Remove-Item $scriptTmp -Force -ErrorAction SilentlyContinue }
ssh @sshArgs $SshTarget 'bash ~/hm-extract.sh; rc=$?; rm -f ~/hm-extract.sh; exit $rc'
if ($LASTEXITCODE -ne 0) { throw "remote extract failed" }

Remove-Item $stage -Recurse -Force
Remove-Item $tarball -Force

# ⚠️ WAIT FOR THE NEW PROCESS TO ACTUALLY SERVE, before anything reads the origin.
#
# touch tmp/restart.txt does not restart Passenger; it tells Passenger to respawn
# on the NEXT request. So for a few seconds after this script "succeeds", the
# origin is still answering from the OLD bundle. Anything that renders from it in
# that window captures stale HTML and looks like the deploy silently did nothing
# — which is exactly what happened twice on 2026-08-24: site:build snapshotted
# the previous homepage, published it to the edge, and every check passed while
# honeymoney.app showed the old page and the origin showed the new one.
#
# One request is enough to trigger the respawn; waiting for its response is what
# proves the new process answered. The settle pause covers Next's own lazy
# route compilation on first hit.
if ($SshTarget -match '^([^@]+)@') {
  $originGuess = $env:DEMO_SITE
  if (-not $originGuess) { $originGuess = "https://$($Matches[1] -replace '_','-').domcloud.dev" }
  Write-Host "==> warming $originGuess so the next reader sees the new build" -ForegroundColor Cyan
  for ($i = 1; $i -le 12; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $originGuess -TimeoutSec 30
      if ($r.StatusCode -eq 200) { Write-Host "    origin answered 200 on attempt $i" -ForegroundColor DarkGray; break }
    } catch { }
    Start-Sleep -Seconds 4
  }
  Start-Sleep -Seconds 3   # let lazily-compiled routes settle
}
Write-Host "==> done. Verify: curl -sI https://<your-host>/ " -ForegroundColor Green
