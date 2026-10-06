$ErrorActionPreference = 'Stop'

# Run beside the site directory to create a current, portable source archive.
$projectRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$siteRoot = Join-Path $projectRoot 'site'
if (-not (Test-Path -LiteralPath (Join-Path $siteRoot 'server.mjs'))) {
    throw 'Place this script in the app folder beside site, then run it again.'
}

$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stagingRoot = Join-Path $temporaryRoot ('futuresight-package-' + [guid]::NewGuid().ToString('N'))
$destination = Join-Path $projectRoot 'futuresight-latest.zip'

try {
    New-Item -ItemType Directory -Path $stagingRoot | Out-Null
    Get-ChildItem -LiteralPath $siteRoot -File -Recurse -Force | ForEach-Object {
        $relativePath = $_.FullName.Substring($siteRoot.Length).TrimStart([char[]]'\/')
        if ($relativePath -match '(^|[\\/])(dist|node_modules|\.git)([\\/]|$)' -or
            $_.Name -match '\.sqlite($|[-.])' -or
            $_.Name -match '^localhost-.*\.log$' -or
            $_.Name -in @('update-rare-ui.mjs','update-build.mjs','update-tests.mjs','update-refresh.mjs','update-guide-label.mjs')) {
            return
        }
        $copyTarget = Join-Path (Join-Path $stagingRoot 'site') $relativePath
        New-Item -ItemType Directory -Path (Split-Path -Parent $copyTarget) -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $copyTarget
    }
    foreach ($fileName in @('handoff.md','package-source.mjs','Package-Latest.ps1')) {
        $sourceFile = Join-Path $projectRoot $fileName
        if (Test-Path -LiteralPath $sourceFile) {
            Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $stagingRoot $fileName)
        }
    }
    $archiveInputs = @(Get-ChildItem -LiteralPath $stagingRoot -Force | ForEach-Object { $_.FullName })
    Compress-Archive -LiteralPath $archiveInputs -DestinationPath $destination -CompressionLevel Optimal -Force
    Write-Host "Created $destination"
    Write-Host 'Includes current code, research snapshots, and handoff. Personal SQLite data and logs are excluded.'
}
finally {
    $resolvedStaging = [System.IO.Path]::GetFullPath($stagingRoot)
    $allowedPrefix = $temporaryRoot.TrimEnd([char[]]'\/') + [System.IO.Path]::DirectorySeparatorChar
    if ($resolvedStaging.StartsWith($allowedPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
        [System.IO.Path]::GetFileName($resolvedStaging).StartsWith('futuresight-package-') -and
        (Test-Path -LiteralPath $resolvedStaging)) {
        Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
}
