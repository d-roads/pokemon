$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
# Listen on the home network so other devices can sign in. Windows may ask once whether
# Node.js can use private networks: choose Allow.
$env:HOST = '0.0.0.0'
$addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -ExpandProperty IPAddress)
Write-Host 'Starting FutureSight.'
Write-Host '  On this computer:  http://127.0.0.1:5173'
foreach ($ip in $addresses) { Write-Host "  On your network:   http://$($ip):5173" }
node server.mjs
