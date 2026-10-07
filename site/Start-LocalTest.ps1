# Starts a LOCAL TEST copy of FutureSight, kept apart from the beta:
#   - its own folder (unzip the test build next to the beta folder, never on top of it),
#   - its own port (5180; the beta uses 5173 and Start-Beta.ps1 only stops 5173/5174),
#   - its own database (data\local-test.sqlite, copied once from the beta's database).
# Nothing here is reachable by beta testers: it listens on this computer only and opens no tunnel.
# Use -Network to also allow other devices on the home network, and -FreshCopy to re-copy the beta's data.
param(
  [string]$BetaSite = '',
  [int]$Port = 5180,
  [switch]$Network,
  [switch]$FreshCopy
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$here = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\')

# Find the beta's site folder: a 'primal-watch\site' folder beside this test folder or beside any
# folder above it (so unzipping one level deeper still works), unless -BetaSite is given.
if (-not $BetaSite) {
  $dir = Split-Path -Parent $here
  for ($i = 0; $i -lt 6 -and $dir; $i++) {
    $candidate = Join-Path $dir 'primal-watch\site'
    if (Test-Path -LiteralPath (Join-Path $candidate 'data\primal-watch.sqlite')) { $BetaSite = $candidate; break }
    $dir = Split-Path -Parent $dir
  }
}
if (-not $BetaSite) {
  Write-Host ''
  Write-Host 'Could not find the beta folder (primal-watch\site) above this folder.' -ForegroundColor Red
  Write-Host 'Run again and point to it, for example:' -ForegroundColor Red
  Write-Host '  .\Start-LocalTest.ps1 -BetaSite "C:\Users\b345t\.codex\.chatgpt-projects\g-p-6a72b895d6288191b4624c5f5479fcae\primal-watch\site"' -ForegroundColor Red
  exit 1
}
$BetaSite = [System.IO.Path]::GetFullPath($BetaSite).TrimEnd('\')
Write-Host "Beta folder: $BetaSite"
if ($BetaSite -ieq $here) {
  throw 'This is the beta folder. Unzip the local test build into its own folder (for example futuresight-local-test) and run Start-LocalTest.ps1 from there.'
}
if ($Port -eq 5173 -or $Port -eq 5174) { throw 'Ports 5173 and 5174 belong to the beta. Choose another port.' }

# The test database: a consistent snapshot of the beta's database (safe while the beta runs).
$testDb = Join-Path $here 'data\local-test.sqlite'
$betaDb = Join-Path $BetaSite 'data\primal-watch.sqlite'
New-Item -ItemType Directory -Path (Join-Path $here 'data') -Force | Out-Null
if ($FreshCopy -and (Test-Path -LiteralPath $testDb)) {
  Remove-Item -LiteralPath $testDb, "$testDb-wal", "$testDb-shm" -Force -ErrorAction SilentlyContinue
}
if (-not (Test-Path -LiteralPath $betaDb)) { throw "No beta database at $betaDb. Check the -BetaSite folder." }
# Copies the beta's accounts, watchlists, Dex and saved sales. A test database that already has
# accounts is kept; an empty one (from an earlier start that missed the beta) is replaced.
node copy-db.mjs "$betaDb" "$testDb" --replace-empty
if ($LASTEXITCODE -ne 0) { throw 'Could not copy the beta database.' }
# Admin password and other optional settings: reuse the beta's .env if this copy has none.
$betaEnv = Join-Path $BetaSite '.env'
# (The admin password lives in the copied database; .env adds optional settings such as Sentry.)
if (-not (Test-Path -LiteralPath (Join-Path $here '.env')) -and (Test-Path -LiteralPath $betaEnv)) {
  Copy-Item -LiteralPath $betaEnv -Destination (Join-Path $here '.env')
}

$env:FUTURESIGHT_CHANNEL = 'local-test'
$env:FUTURESIGHT_DB = $testDb
$env:PORT = "$Port"
$env:HOST = if ($Network) { '0.0.0.0' } else { '127.0.0.1' }
Write-Host ''
Write-Host '==============================================================' -ForegroundColor Yellow
Write-Host "  LOCAL TEST build:  http://127.0.0.1:$Port" -ForegroundColor Yellow
Write-Host '  Beta testers are NOT affected. The beta keeps running as is.' -ForegroundColor Yellow
Write-Host '==============================================================' -ForegroundColor Yellow
Write-Host ''
node server.mjs
