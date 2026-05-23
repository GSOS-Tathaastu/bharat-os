$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$nodePath = Join-Path $repoRoot '.tools/node-v24.16.0-win-x64/node.exe'
$apiPath = Join-Path $repoRoot 'bin/bos-api.mjs'

if (-not (Test-Path -LiteralPath $nodePath)) {
    throw "Node.js was not found at $nodePath. Re-run the toolchain install step."
}

& $nodePath $apiPath @args
if ($LASTEXITCODE -ne 0) {
    throw "Bharat OS API exited with code $LASTEXITCODE."
}
