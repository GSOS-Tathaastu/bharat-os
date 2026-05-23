$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$nodePath = Join-Path $repoRoot '.tools/node-v24.16.0-win-x64/node.exe'
$cliPath = Join-Path $repoRoot 'bin/bos.mjs'

if (-not (Test-Path -LiteralPath $nodePath)) {
    throw "Node.js was not found at $nodePath. Re-run the toolchain install step."
}

& $nodePath $cliPath @args
if ($LASTEXITCODE -ne 0) {
    throw "Bharat OS CLI exited with code $LASTEXITCODE."
}
