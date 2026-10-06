# Starts FutureSight for beta testers: the app on this computer, plus a Cloudflare Quick Tunnel
# that gives it an https://....trycloudflare.com link anyone with the link can open.
# Testers create their account with an invite code from:  node invite.mjs
# Keep this window open while people are testing; closing it takes the link down.
# Each start gives a NEW link (Quick Tunnels do not keep their address), so re-send it after a restart.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$port = 5173
$cloudflared = Join-Path $PSScriptRoot '.tools\cloudflared.exe'
if (-not (Test-Path -LiteralPath $cloudflared)) {
  $found = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($found) { $cloudflared = $found.Source } else { throw "cloudflared.exe was not found in $PSScriptRoot\.tools. Download it from https://github.com/cloudflare/cloudflared/releases and put it there." }
}

# Close older FutureSight servers on 5173/5174 and older tunnels, so the new code is what runs.
foreach ($p in 5173, 5174) {
  foreach ($c in @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)) {
    $proc = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') { Write-Host "Stopping the old FutureSight server on port $p."; Stop-Process -Id $proc.Id -Force }
  }
}
Get-Process cloudflared -ErrorAction SilentlyContinue | ForEach-Object { Write-Host 'Stopping the old tunnel.'; Stop-Process -Id $_.Id -Force }
Start-Sleep -Seconds 1

# The app, in its own minimized window (its messages appear there). It also stays reachable on the home network.
$serverCmd = "`$env:HOST='0.0.0.0'; `$env:PORT='$port'; Set-Location -LiteralPath '$PSScriptRoot'; node server.mjs"
Start-Process powershell -WindowStyle Minimized -ArgumentList '-NoExit', '-Command', $serverCmd | Out-Null
Write-Host 'Starting FutureSight...'
$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
  Start-Sleep -Seconds 1
  $ready = [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}
if (-not $ready) { throw 'FutureSight did not start. Open the minimized FutureSight window to see why.' }
Write-Host "FutureSight is running at http://127.0.0.1:$port"

# The tunnel. Its link is printed in a box below once Cloudflare hands it out.
Write-Host 'Opening the internet link (takes a few seconds)...'
# cloudflared writes all of its messages to stderr; let them through instead of treating them as errors.
$ErrorActionPreference = 'Continue'
& $cloudflared tunnel --no-autoupdate --url "http://127.0.0.1:$port" 2>&1 | ForEach-Object {
  $line = "$_"
  if ($line -match '(https://[a-z0-9-]+\.trycloudflare\.com)') {
    Write-Host ''
    Write-Host '==============================================================' -ForegroundColor Green
    Write-Host "  Beta link:  $($Matches[1])" -ForegroundColor Green
    Write-Host '  Testers need an invite code:  node invite.mjs' -ForegroundColor Green
    Write-Host '==============================================================' -ForegroundColor Green
    Write-Host ''
  } elseif ($line -match '\b(ERR|error)\b') { Write-Host $line -ForegroundColor Yellow }
}
