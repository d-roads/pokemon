$ErrorActionPreference = 'Stop'
$WorkspaceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$PromptFile = Join-Path $PSScriptRoot '02-scarlet-violet-mega.md'
$LogFile = Join-Path $PSScriptRoot '02-run.log'
$StatusFile = Join-Path $PSScriptRoot '02-run-status.json'

Set-Location -LiteralPath $WorkspaceRoot
$codexDataDir = Join-Path $env:USERPROFILE '.codex'
if (-not $env:CODEX_HOME) { $env:CODEX_HOME = $codexDataDir }
$started = Get-Date
try {
    $codexCommand = (Get-Command codex -ErrorAction SilentlyContinue).Source
    if (-not $codexCommand) {
        $binaryRoot = Join-Path $env:LOCALAPPDATA 'OpenAI\Codex\bin'
        $codexCommand = Get-ChildItem -LiteralPath $binaryRoot -Filter codex.exe -File -Recurse -ErrorAction Stop |
            Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    }
    if (-not $codexCommand) { throw 'Codex executable was not found.' }
    $ErrorActionPreference = 'Continue'
    Get-Content -LiteralPath $PromptFile -Raw | & $codexCommand exec -C $WorkspaceRoot --skip-git-repo-check --approve-for-me --ephemeral - *> $LogFile
    $ErrorActionPreference = 'Stop'
    $exitCode = $LASTEXITCODE
} catch {
    $_ | Out-String | Out-File -LiteralPath $LogFile -Append
    $exitCode = 1
}
@{
    startedAt = $started.ToString('o')
    finishedAt = (Get-Date).ToString('o')
    exitCode = $exitCode
    log = $LogFile
} | ConvertTo-Json | Set-Content -LiteralPath $StatusFile
exit $exitCode
