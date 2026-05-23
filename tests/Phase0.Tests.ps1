$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $repoRoot 'src/BharatOS.Phase0/BharatOS.Phase0.psd1'
Import-Module $modulePath -Force -DisableNameChecking

$script:Passed = 0

function Assert-True {
    param(
        [Parameter(Mandatory = $true)][bool]$Condition,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if (-not $Condition) {
        throw "Assertion failed: $Message"
    }
}

function Assert-Equal {
    param(
        [Parameter(Mandatory = $true)]$Expected,
        [Parameter(Mandatory = $true)]$Actual,
        [Parameter(Mandatory = $true)][string]$Message
    )

    if ($Expected -ne $Actual) {
        throw "Assertion failed: $Message. Expected [$Expected], got [$Actual]."
    }
}

function Assert-Throws {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$ScriptBlock,
        [Parameter(Mandatory = $true)][string]$Message
    )

    $threw = $false
    try {
        & $ScriptBlock
    }
    catch {
        $threw = $true
    }

    if (-not $threw) {
        throw "Assertion failed: $Message"
    }
}

function Invoke-Test {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Body
    )

    & $Body
    $script:Passed += 1
    Write-Host "PASS $Name"
}

Invoke-Test 'identity creates public records without private material' {
    $identity = New-BosIdentity -DisplayName 'Phase 0 Operator' -Attestations @{
        Aadhaar = 'offline-ekyc-placeholder'
    }
    $public = Get-BosIdentityPublicRecord -Identity $identity

    Assert-True ($identity.Id -like 'bos:person:*') 'identity ID should use person prefix'
    Assert-Equal $identity.Id $public.Id 'public record should preserve identity ID'
    Assert-True (-not ($public.PSObject.Properties.Name -contains 'PrivateKeyXml')) 'public record must omit private key'
    Assert-True (-not ($public.PSObject.Properties.Name -contains 'VaultKeyBase64')) 'public record must omit local vault key'
}

Invoke-Test 'protocol signatures verify and reject tampering' {
    $identity = New-BosIdentity -DisplayName 'Signer'
    $public = Get-BosIdentityPublicRecord -Identity $identity
    $text = '{"intent":"register-node"}'
    $signature = Sign-BosText -Identity $identity -Text $text

    Assert-True (Test-BosSignature -PublicIdentity $public -Text $text -Signature $signature) 'valid signature should verify'
    Assert-True (-not (Test-BosSignature -PublicIdentity $public -Text '{"intent":"tampered"}' -Signature $signature)) 'tampered text should fail signature verification'
}

Invoke-Test 'encrypted object round-trips without payload in manifest' {
    $identity = New-BosIdentity -DisplayName 'Vault Owner'
    $plainText = 'Bharat OS Phase 0 stores pointers, not payloads.'
    $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($plainText)
    $bundle = New-BosEncryptedObject -Identity $identity -Bytes $plainBytes -ChunkSizeBytes 12 -ContentType 'text/plain'

    Assert-BosManifest -Manifest $bundle.Manifest | Out-Null
    $manifestJson = Export-BosJson -Value $bundle.Manifest
    Assert-True (-not $manifestJson.Contains($plainText)) 'manifest must not contain plaintext'
    foreach ($chunk in $bundle.Manifest.Chunks) {
        Assert-True (-not ($chunk.PSObject.Properties.Name -contains 'CiphertextBase64')) 'chunk descriptors must not contain ciphertext payload'
    }

    $roundTrip = Read-BosEncryptedObject -Identity $identity -Bundle $bundle
    Assert-Equal $plainText ([System.Text.Encoding]::UTF8.GetString($roundTrip)) 'encrypted object should decrypt to original text'
}

Invoke-Test 'encrypted object detects chunk tampering' {
    $identity = New-BosIdentity -DisplayName 'Tamper Test'
    $plainBytes = [System.Text.Encoding]::UTF8.GetBytes('tamper detection matters')
    $bundle = New-BosEncryptedObject -Identity $identity -Bytes $plainBytes -ChunkSizeBytes 8
    $firstChunkId = @($bundle.Chunks.Keys)[0]
    $bundle.Chunks[$firstChunkId].CiphertextBase64 = [Convert]::ToBase64String([byte[]](1, 2, 3, 4))

    Assert-Throws { Read-BosEncryptedObject -Identity $identity -Bundle $bundle | Out-Null } 'tampered ciphertext should be rejected'
}

Invoke-Test 'mesh placement only uses eligible KYC charging WiFi nodes' {
    $owner = New-BosIdentity -DisplayName 'Mesh Owner'
    $bundle = New-BosEncryptedObject -Identity $owner -Bytes ([System.Text.Encoding]::UTF8.GetBytes('mesh payload')) -ChunkSizeBytes 64
    $controlPlane = New-BosControlPlane

    $eligibleA = Register-BosNode -ControlPlane $controlPlane -Node (New-BosNode -OperatorId $owner.Id -StorageBytes 4096 -KycVerified $true -Charging $true -Wifi $true -BatteryPercent 90 -TrustScore 90)
    $eligibleB = Register-BosNode -ControlPlane $controlPlane -Node (New-BosNode -OperatorId $owner.Id -StorageBytes 4096 -KycVerified $true -Charging $true -Wifi $true -BatteryPercent 80 -TrustScore 80)
    $notKyc = Register-BosNode -ControlPlane $controlPlane -Node (New-BosNode -OperatorId $owner.Id -StorageBytes 4096 -KycVerified $false -Charging $true -Wifi $true -BatteryPercent 90 -TrustScore 100)
    $notWifi = Register-BosNode -ControlPlane $controlPlane -Node (New-BosNode -OperatorId $owner.Id -StorageBytes 4096 -KycVerified $true -Charging $true -Wifi $false -BatteryPercent 90 -TrustScore 100)

    Publish-BosManifest -ControlPlane $controlPlane -Manifest $bundle.Manifest | Out-Null
    $plan = New-BosPlacementPlan -ControlPlane $controlPlane -Manifest $bundle.Manifest -ReplicationFactor 2

    $usedNodeIds = @($plan.Placements | Select-Object -ExpandProperty NodeId -Unique)
    Assert-True ($usedNodeIds -contains $eligibleA.NodeId) 'eligible node A should be selected'
    Assert-True ($usedNodeIds -contains $eligibleB.NodeId) 'eligible node B should be selected'
    Assert-True (-not ($usedNodeIds -contains $notKyc.NodeId)) 'non-KYC node should be excluded'
    Assert-True (-not ($usedNodeIds -contains $notWifi.NodeId)) 'non-WiFi node should be excluded'

    Commit-BosPlacementPlan -ControlPlane $controlPlane -Plan $plan | Out-Null
    Assert-True ($controlPlane.Commitments.Count -gt 0) 'committed placement should create commitments'
}

Invoke-Test 'mesh placement fails closed when capacity is insufficient' {
    $owner = New-BosIdentity -DisplayName 'Capacity Owner'
    $bundle = New-BosEncryptedObject -Identity $owner -Bytes ([System.Text.Encoding]::UTF8.GetBytes('capacity payload')) -ChunkSizeBytes 64
    $controlPlane = New-BosControlPlane

    Register-BosNode -ControlPlane $controlPlane -Node (New-BosNode -OperatorId $owner.Id -StorageBytes 1 -KycVerified $true -Charging $true -Wifi $true -BatteryPercent 90) | Out-Null
    Register-BosNode -ControlPlane $controlPlane -Node (New-BosNode -OperatorId $owner.Id -StorageBytes 1 -KycVerified $true -Charging $true -Wifi $true -BatteryPercent 90) | Out-Null

    Assert-Throws { New-BosPlacementPlan -ControlPlane $controlPlane -Manifest $bundle.Manifest -ReplicationFactor 2 | Out-Null } 'insufficient capacity should fail closed'
}

Invoke-Test 'net contribution score classifies producers and consumers' {
    $producer = Get-BosNetContributionScore -ContributedBytes 1000 -ConsumedBytes 250
    $consumer = Get-BosNetContributionScore -ContributedBytes 100 -ConsumedBytes 250

    Assert-Equal 'producer' $producer.Class 'positive NCS should be producer'
    Assert-Equal 750 $producer.ScoreBytes 'producer NCS should be contributed minus consumed'
    Assert-Equal 'consumer' $consumer.Class 'negative NCS should be consumer'
    Assert-Equal -150 $consumer.ScoreBytes 'consumer NCS should be negative'
}

Write-Host "$script:Passed tests passed."
