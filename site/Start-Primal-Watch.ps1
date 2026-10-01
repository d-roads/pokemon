$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
Write-Host 'Starting Primal Watch. Open http://127.0.0.1:5173 in your browser.'
node server.mjs
