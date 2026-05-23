$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$testFiles = @(
    Join-Path $repoRoot 'tests/Phase0.Tests.ps1'
)

foreach ($testFile in $testFiles) {
    Write-Host "Running $testFile"
    & $testFile
}

& (Join-Path $repoRoot 'scripts/js-test.ps1')

Write-Host 'All Bharat OS tests passed.'
