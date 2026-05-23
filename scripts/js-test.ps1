$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$nodePath = Join-Path $repoRoot '.tools/node-v24.16.0-win-x64/node.exe'
$testFiles = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'tests/node') -Filter '*.test.mjs' |
    Sort-Object FullName |
    ForEach-Object {
        "tests/node/$($_.Name)"
    })

if (-not (Test-Path -LiteralPath $nodePath)) {
    throw "Node.js was not found at $nodePath. Re-run the toolchain install step."
}

Push-Location $repoRoot
try {
    & $nodePath --test @testFiles
    if ($LASTEXITCODE -ne 0) {
        throw "Node test suite failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
