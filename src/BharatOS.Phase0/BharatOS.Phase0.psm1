Set-StrictMode -Version Latest

$script:BosProtocolVersion = 'bos.phase0.v0'

function New-BosTimestamp {
    return [DateTimeOffset]::UtcNow.ToString('o')
}

function ConvertTo-BosBytes {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)

    return [System.Text.Encoding]::UTF8.GetBytes($Text)
}

function ConvertFrom-BosBytes {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    return [System.Text.Encoding]::UTF8.GetString($Bytes)
}

function ConvertTo-BosHex {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    return ([BitConverter]::ToString($Bytes) -replace '-', '').ToLowerInvariant()
}

function Get-BosSha256Bytes {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return $sha.ComputeHash($Bytes)
    }
    finally {
        $sha.Dispose()
    }
}

function Get-BosSha256Hex {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    return ConvertTo-BosHex -Bytes (Get-BosSha256Bytes -Bytes $Bytes)
}

function New-BosRandomBytes {
    param([Parameter(Mandatory = $true)][ValidateRange(1, 4096)][int]$Length)

    $bytes = New-Object byte[] $Length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return $bytes
    }
    finally {
        $rng.Dispose()
    }
}

function Join-BosBytes {
    param([Parameter(Mandatory = $true)][byte[][]]$Parts)

    $total = 0
    foreach ($part in $Parts) {
        if ($null -ne $part) {
            $total += $part.Length
        }
    }

    $joined = New-Object byte[] $total
    $offset = 0
    foreach ($part in $Parts) {
        if ($null -eq $part) {
            continue
        }

        [Array]::Copy($part, 0, $joined, $offset, $part.Length)
        $offset += $part.Length
    }

    return $joined
}

function Test-BosFixedTimeEqual {
    param(
        [Parameter(Mandatory = $true)][byte[]]$Left,
        [Parameter(Mandatory = $true)][byte[]]$Right
    )

    if ($Left.Length -ne $Right.Length) {
        return $false
    }

    $diff = 0
    for ($i = 0; $i -lt $Left.Length; $i++) {
        $diff = $diff -bor ($Left[$i] -bxor $Right[$i])
    }

    return $diff -eq 0
}

function Get-BosDerivedKeys {
    param(
        [Parameter(Mandatory = $true)][byte[]]$Key,
        [Parameter(Mandatory = $true)][string]$Context
    )

    $hmac = New-Object System.Security.Cryptography.HMACSHA512
    $hmac.Key = $Key
    try {
        $material = $hmac.ComputeHash((ConvertTo-BosBytes -Text $Context))
    }
    finally {
        $hmac.Dispose()
    }

    $encKey = New-Object byte[] 32
    $macKey = New-Object byte[] 32
    [Array]::Copy($material, 0, $encKey, 0, 32)
    [Array]::Copy($material, 32, $macKey, 0, 32)

    return [pscustomobject]@{
        EncryptionKey = $encKey
        MacKey = $macKey
    }
}

function Protect-BosBytes {
    param(
        [Parameter(Mandatory = $true)][byte[]]$PlainBytes,
        [Parameter(Mandatory = $true)][byte[]]$Key,
        [Parameter(Mandatory = $true)][string]$Context
    )

    $derived = Get-BosDerivedKeys -Key $Key -Context $Context
    $iv = New-BosRandomBytes -Length 16
    $aes = New-Object System.Security.Cryptography.AesManaged
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.KeySize = 256
    $aes.BlockSize = 128

    try {
        $encryptor = $aes.CreateEncryptor($derived.EncryptionKey, $iv)
        try {
            $cipherBytes = $encryptor.TransformFinalBlock($PlainBytes, 0, $PlainBytes.Length)
        }
        finally {
            $encryptor.Dispose()
        }
    }
    finally {
        $aes.Dispose()
    }

    $macInput = Join-BosBytes -Parts @(
        (ConvertTo-BosBytes -Text $Context),
        $iv,
        $cipherBytes
    )
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $derived.MacKey
    try {
        $mac = $hmac.ComputeHash($macInput)
    }
    finally {
        $hmac.Dispose()
    }

    return [pscustomobject]@{
        Algorithm = 'AES-256-CBC-HMAC-SHA256'
        IvBase64 = [Convert]::ToBase64String($iv)
        CiphertextBase64 = [Convert]::ToBase64String($cipherBytes)
        MacBase64 = [Convert]::ToBase64String($mac)
    }
}

function Unprotect-BosBytes {
    param(
        [Parameter(Mandatory = $true)]$ProtectedObject,
        [Parameter(Mandatory = $true)][byte[]]$Key,
        [Parameter(Mandatory = $true)][string]$Context
    )

    if ($ProtectedObject.Algorithm -ne 'AES-256-CBC-HMAC-SHA256') {
        throw "Unsupported protected object algorithm: $($ProtectedObject.Algorithm)"
    }

    $derived = Get-BosDerivedKeys -Key $Key -Context $Context
    $iv = [Convert]::FromBase64String($ProtectedObject.IvBase64)
    $cipherBytes = [Convert]::FromBase64String($ProtectedObject.CiphertextBase64)
    $expectedMac = [Convert]::FromBase64String($ProtectedObject.MacBase64)

    $macInput = Join-BosBytes -Parts @(
        (ConvertTo-BosBytes -Text $Context),
        $iv,
        $cipherBytes
    )
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $derived.MacKey
    try {
        $actualMac = $hmac.ComputeHash($macInput)
    }
    finally {
        $hmac.Dispose()
    }

    if (-not (Test-BosFixedTimeEqual -Left $expectedMac -Right $actualMac)) {
        throw 'Protected object MAC verification failed.'
    }

    $aes = New-Object System.Security.Cryptography.AesManaged
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.KeySize = 256
    $aes.BlockSize = 128

    try {
        $decryptor = $aes.CreateDecryptor($derived.EncryptionKey, $iv)
        try {
            return $decryptor.TransformFinalBlock($cipherBytes, 0, $cipherBytes.Length)
        }
        finally {
            $decryptor.Dispose()
        }
    }
    finally {
        $aes.Dispose()
    }
}

function Export-BosJson {
    param(
        [Parameter(Mandatory = $true)]$Value,
        [int]$Depth = 24
    )

    return ($Value | ConvertTo-Json -Depth $Depth -Compress)
}

function New-BosIdentity {
    param(
        [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$DisplayName,
        [hashtable]$Attestations = @{}
    )

    $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider 2048
    $rsa.PersistKeyInCsp = $false
    $publicKeyXml = $rsa.ToXmlString($false)
    $privateKeyXml = $rsa.ToXmlString($true)
    $publicHash = Get-BosSha256Hex -Bytes (ConvertTo-BosBytes -Text $publicKeyXml)
    $identityId = "bos:person:$($publicHash.Substring(0, 32))"
    $vaultKey = New-BosRandomBytes -Length 32

    return [pscustomobject]@{
        ProtocolVersion = $script:BosProtocolVersion
        Id = $identityId
        DisplayName = $DisplayName
        PublicKeyXml = $publicKeyXml
        PrivateKeyXml = $privateKeyXml
        VaultKeyBase64 = [Convert]::ToBase64String($vaultKey)
        Attestations = $Attestations
        CreatedAt = New-BosTimestamp
    }
}

function Get-BosIdentityPublicRecord {
    param([Parameter(Mandatory = $true)]$Identity)

    return [pscustomobject]@{
        ProtocolVersion = $Identity.ProtocolVersion
        Id = $Identity.Id
        DisplayName = $Identity.DisplayName
        PublicKeyXml = $Identity.PublicKeyXml
        Attestations = $Identity.Attestations
        CreatedAt = $Identity.CreatedAt
    }
}

function Sign-BosText {
    param(
        [Parameter(Mandatory = $true)]$Identity,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text
    )

    $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider 2048
    $rsa.PersistKeyInCsp = $false
    $rsa.FromXmlString($Identity.PrivateKeyXml)
    try {
        $signature = $rsa.SignData(
            (ConvertTo-BosBytes -Text $Text),
            [System.Security.Cryptography.CryptoConfig]::MapNameToOID('SHA256')
        )
    }
    finally {
        $rsa.Dispose()
    }

    return [pscustomobject]@{
        Algorithm = 'RSA-SHA256'
        SignerId = $Identity.Id
        SignatureBase64 = [Convert]::ToBase64String($signature)
    }
}

function Test-BosSignature {
    param(
        [Parameter(Mandatory = $true)]$PublicIdentity,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
        [Parameter(Mandatory = $true)]$Signature
    )

    if ($Signature.Algorithm -ne 'RSA-SHA256') {
        return $false
    }

    if ($Signature.SignerId -ne $PublicIdentity.Id) {
        return $false
    }

    $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider 2048
    $rsa.PersistKeyInCsp = $false
    $rsa.FromXmlString($PublicIdentity.PublicKeyXml)
    try {
        return $rsa.VerifyData(
            (ConvertTo-BosBytes -Text $Text),
            [System.Security.Cryptography.CryptoConfig]::MapNameToOID('SHA256'),
            [Convert]::FromBase64String($Signature.SignatureBase64)
        )
    }
    finally {
        $rsa.Dispose()
    }
}

function New-BosEncryptedObject {
    param(
        [Parameter(Mandatory = $true)]$Identity,
        [Parameter(Mandatory = $true)][byte[]]$Bytes,
        [ValidateRange(1, 10485760)][int]$ChunkSizeBytes = 262144,
        [string]$ContentType = 'application/octet-stream'
    )

    $vaultKey = [Convert]::FromBase64String($Identity.VaultKeyBase64)
    $fileKey = New-BosRandomBytes -Length 32
    $sealedFileKey = Protect-BosBytes `
        -PlainBytes $fileKey `
        -Key $vaultKey `
        -Context "bos:vault-file-key:$($Identity.Id)"

    $chunks = [ordered]@{}
    $chunkDescriptors = New-Object System.Collections.Generic.List[object]

    $total = $Bytes.Length
    $chunkCount = [Math]::Max(1, [Math]::Ceiling($total / [double]$ChunkSizeBytes))
    for ($index = 0; $index -lt $chunkCount; $index++) {
        $offset = $index * $ChunkSizeBytes
        $remaining = [Math]::Max(0, $total - $offset)
        $length = [Math]::Min($ChunkSizeBytes, $remaining)
        $plainChunk = New-Object byte[] $length
        if ($length -gt 0) {
            [Array]::Copy($Bytes, $offset, $plainChunk, 0, $length)
        }

        $protectedChunk = Protect-BosBytes `
            -PlainBytes $plainChunk `
            -Key $fileKey `
            -Context "bos:chunk:$index"
        $cipherBytes = [Convert]::FromBase64String($protectedChunk.CiphertextBase64)
        $cipherHash = Get-BosSha256Hex -Bytes $cipherBytes
        $chunkId = "bos:chunk:$($cipherHash.Substring(0, 32))"

        $chunks[$chunkId] = [pscustomobject]@{
            ChunkId = $chunkId
            CiphertextBase64 = $protectedChunk.CiphertextBase64
        }

        $chunkDescriptors.Add([pscustomobject]@{
            Index = $index
            ChunkId = $chunkId
            PlaintextBytes = $length
            CiphertextBytes = $cipherBytes.Length
            CiphertextSha256 = $cipherHash
            IvBase64 = $protectedChunk.IvBase64
            MacBase64 = $protectedChunk.MacBase64
            Algorithm = $protectedChunk.Algorithm
        })
    }

    $manifestCore = [pscustomobject]@{
        ProtocolVersion = $script:BosProtocolVersion
        ObjectType = 'encrypted-chunk-manifest'
        OwnerId = $Identity.Id
        ContentType = $ContentType
        ChunkSizeBytes = $ChunkSizeBytes
        PlaintextBytes = $Bytes.Length
        SealedFileKey = $sealedFileKey
        Chunks = $chunkDescriptors.ToArray()
        CreatedAt = New-BosTimestamp
    }
    $manifestJson = Export-BosJson -Value $manifestCore
    $manifestHash = Get-BosSha256Hex -Bytes (ConvertTo-BosBytes -Text $manifestJson)

    $manifest = [pscustomobject]@{
        ManifestId = "bos:manifest:$($manifestHash.Substring(0, 32))"
        ProtocolVersion = $manifestCore.ProtocolVersion
        ObjectType = $manifestCore.ObjectType
        OwnerId = $manifestCore.OwnerId
        ContentType = $manifestCore.ContentType
        ChunkSizeBytes = $manifestCore.ChunkSizeBytes
        PlaintextBytes = $manifestCore.PlaintextBytes
        SealedFileKey = $manifestCore.SealedFileKey
        Chunks = $manifestCore.Chunks
        CreatedAt = $manifestCore.CreatedAt
    }

    return [pscustomobject]@{
        Manifest = $manifest
        Chunks = $chunks
    }
}

function Read-BosEncryptedObject {
    param(
        [Parameter(Mandatory = $true)]$Identity,
        [Parameter(Mandatory = $true)]$Bundle
    )

    $manifest = $Bundle.Manifest
    if ($manifest.OwnerId -ne $Identity.Id) {
        throw "Identity $($Identity.Id) cannot read manifest owned by $($manifest.OwnerId)."
    }

    Assert-BosManifest -Manifest $manifest | Out-Null

    $vaultKey = [Convert]::FromBase64String($Identity.VaultKeyBase64)
    $fileKey = Unprotect-BosBytes `
        -ProtectedObject $manifest.SealedFileKey `
        -Key $vaultKey `
        -Context "bos:vault-file-key:$($Identity.Id)"

    $plainParts = New-Object System.Collections.Generic.List[byte[]]
    foreach ($descriptor in ($manifest.Chunks | Sort-Object Index)) {
        if (-not $Bundle.Chunks.Contains($descriptor.ChunkId)) {
            throw "Missing encrypted chunk: $($descriptor.ChunkId)"
        }

        $storedChunk = $Bundle.Chunks[$descriptor.ChunkId]
        $cipherBytes = [Convert]::FromBase64String($storedChunk.CiphertextBase64)
        $actualHash = Get-BosSha256Hex -Bytes $cipherBytes
        if ($actualHash -ne $descriptor.CiphertextSha256) {
            throw "Chunk hash verification failed for $($descriptor.ChunkId)."
        }

        $protectedChunk = [pscustomobject]@{
            Algorithm = $descriptor.Algorithm
            IvBase64 = $descriptor.IvBase64
            CiphertextBase64 = $storedChunk.CiphertextBase64
            MacBase64 = $descriptor.MacBase64
        }
        $plainParts.Add((Unprotect-BosBytes `
            -ProtectedObject $protectedChunk `
            -Key $fileKey `
            -Context "bos:chunk:$($descriptor.Index)"))
    }

    $joined = Join-BosBytes -Parts ([byte[][]]$plainParts.ToArray())
    if ($joined.Length -ne $manifest.PlaintextBytes) {
        throw "Plaintext length mismatch. Expected $($manifest.PlaintextBytes), got $($joined.Length)."
    }

    return $joined
}

function Assert-BosManifest {
    param([Parameter(Mandatory = $true)]$Manifest)

    if ($Manifest.ProtocolVersion -ne $script:BosProtocolVersion) {
        throw "Unsupported manifest protocol version: $($Manifest.ProtocolVersion)"
    }

    if ($Manifest.ObjectType -ne 'encrypted-chunk-manifest') {
        throw "Unsupported manifest type: $($Manifest.ObjectType)"
    }

    if (-not ($Manifest.OwnerId -like 'bos:person:*')) {
        throw 'Manifest owner must be a Bharat OS person identity.'
    }

    if (-not ($Manifest.ManifestId -like 'bos:manifest:*')) {
        throw 'Manifest ID must use bos:manifest prefix.'
    }

    foreach ($chunk in $Manifest.Chunks) {
        if (-not ($chunk.ChunkId -like 'bos:chunk:*')) {
            throw "Invalid chunk ID: $($chunk.ChunkId)"
        }

        if ($chunk.PSObject.Properties.Name -contains 'CiphertextBase64') {
            throw 'Manifest violates pointer-not-payload: ciphertext belongs in the chunk store.'
        }

        if ($chunk.PSObject.Properties.Name -contains 'PlaintextBase64') {
            throw 'Manifest violates pointer-not-payload: plaintext must never appear in manifests.'
        }
    }

    return $true
}

function New-BosControlPlane {
    return [pscustomobject]@{
        ProtocolVersion = $script:BosProtocolVersion
        Nodes = [ordered]@{}
        Manifests = [ordered]@{}
        Commitments = New-Object System.Collections.Generic.List[object]
        Ledger = New-Object System.Collections.Generic.List[object]
        CreatedAt = New-BosTimestamp
    }
}

function New-BosNode {
    param(
        [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$OperatorId,
        [Parameter(Mandatory = $true)][ValidateRange(1, [long]::MaxValue)][long]$StorageBytes,
        [bool]$KycVerified = $false,
        [bool]$Charging = $true,
        [bool]$Wifi = $true,
        [ValidateRange(0, 100)][int]$BatteryPercent = 100,
        [ValidateRange(0, 100)][int]$TrustScore = 50,
        [string[]]$Capabilities = @('storage')
    )

    $seed = "$OperatorId|$(New-BosTimestamp)|$([Guid]::NewGuid().ToString('n'))"
    $hash = Get-BosSha256Hex -Bytes (ConvertTo-BosBytes -Text $seed)

    return [pscustomobject]@{
        ProtocolVersion = $script:BosProtocolVersion
        NodeId = "bos:node:$($hash.Substring(0, 32))"
        OperatorId = $OperatorId
        KycVerified = $KycVerified
        Charging = $Charging
        Wifi = $Wifi
        BatteryPercent = $BatteryPercent
        TrustScore = $TrustScore
        StorageBytes = [long]$StorageBytes
        UsedBytes = [long]0
        Capabilities = $Capabilities
        LastSeenAt = New-BosTimestamp
    }
}

function Register-BosNode {
    param(
        [Parameter(Mandatory = $true)]$ControlPlane,
        [Parameter(Mandatory = $true)]$Node
    )

    if (-not ($Node.NodeId -like 'bos:node:*')) {
        throw "Invalid node ID: $($Node.NodeId)"
    }

    $ControlPlane.Nodes[$Node.NodeId] = $Node
    $ControlPlane.Ledger.Add([pscustomobject]@{
        Type = 'node.registered'
        NodeId = $Node.NodeId
        OperatorId = $Node.OperatorId
        At = New-BosTimestamp
    }) | Out-Null

    return $Node
}

function Publish-BosManifest {
    param(
        [Parameter(Mandatory = $true)]$ControlPlane,
        [Parameter(Mandatory = $true)]$Manifest
    )

    Assert-BosManifest -Manifest $Manifest | Out-Null
    $ControlPlane.Manifests[$Manifest.ManifestId] = $Manifest
    $ControlPlane.Ledger.Add([pscustomobject]@{
        Type = 'manifest.published'
        ManifestId = $Manifest.ManifestId
        OwnerId = $Manifest.OwnerId
        At = New-BosTimestamp
    }) | Out-Null

    return $Manifest
}

function Test-BosNodeEligible {
    param(
        [Parameter(Mandatory = $true)]$Node,
        [Parameter(Mandatory = $true)][ValidateRange(0, [long]::MaxValue)][long]$RequiredBytes,
        [bool]$RequireKyc = $true,
        [ValidateRange(0, 100)][int]$BatteryThreshold = 40
    )

    $reasons = New-Object System.Collections.Generic.List[string]
    $availableBytes = [long]$Node.StorageBytes - [long]$Node.UsedBytes

    if ($RequireKyc -and -not $Node.KycVerified) {
        $reasons.Add('kyc_required') | Out-Null
    }
    if (-not $Node.Wifi) {
        $reasons.Add('wifi_required') | Out-Null
    }
    if (-not $Node.Charging) {
        $reasons.Add('charging_required') | Out-Null
    }
    if ($Node.BatteryPercent -lt $BatteryThreshold) {
        $reasons.Add('battery_below_threshold') | Out-Null
    }
    if ($availableBytes -lt $RequiredBytes) {
        $reasons.Add('insufficient_storage') | Out-Null
    }
    if (-not ($Node.Capabilities -contains 'storage')) {
        $reasons.Add('storage_capability_required') | Out-Null
    }

    return [pscustomobject]@{
        Eligible = $reasons.Count -eq 0
        Reasons = @($reasons)
        AvailableBytes = $availableBytes
    }
}

function New-BosPlacementPlan {
    param(
        [Parameter(Mandatory = $true)]$ControlPlane,
        [Parameter(Mandatory = $true)]$Manifest,
        [ValidateRange(1, 100)][int]$ReplicationFactor = 3,
        [bool]$RequireKyc = $true,
        [ValidateRange(0, 100)][int]$BatteryThreshold = 40
    )

    Assert-BosManifest -Manifest $Manifest | Out-Null

    $plannedUse = @{}
    foreach ($node in $ControlPlane.Nodes.Values) {
        $plannedUse[$node.NodeId] = [long]$node.UsedBytes
    }

    $placements = New-Object System.Collections.Generic.List[object]
    foreach ($chunk in $Manifest.Chunks) {
        $requiredBytes = [long]$chunk.CiphertextBytes
        $eligible = New-Object System.Collections.Generic.List[object]

        foreach ($node in $ControlPlane.Nodes.Values) {
            $shadow = $node.PSObject.Copy()
            $shadow.UsedBytes = [long]$plannedUse[$node.NodeId]
            $result = Test-BosNodeEligible `
                -Node $shadow `
                -RequiredBytes $requiredBytes `
                -RequireKyc $RequireKyc `
                -BatteryThreshold $BatteryThreshold

            if ($result.Eligible) {
                $eligible.Add($shadow) | Out-Null
            }
        }

        $selected = @($eligible |
            Sort-Object @{ Expression = 'TrustScore'; Descending = $true },
                        @{ Expression = 'StorageBytes'; Descending = $true },
                        @{ Expression = 'NodeId'; Descending = $false } |
            Select-Object -First $ReplicationFactor)

        if ($selected.Count -lt $ReplicationFactor) {
            throw "Not enough eligible nodes for chunk $($chunk.ChunkId). Needed $ReplicationFactor, found $($selected.Count)."
        }

        foreach ($node in $selected) {
            $plannedUse[$node.NodeId] = [long]$plannedUse[$node.NodeId] + $requiredBytes
            $placements.Add([pscustomobject]@{
                ManifestId = $Manifest.ManifestId
                ChunkId = $chunk.ChunkId
                ChunkIndex = $chunk.Index
                NodeId = $node.NodeId
                Bytes = $requiredBytes
            }) | Out-Null
        }
    }

    $planCore = [pscustomobject]@{
        ManifestId = $Manifest.ManifestId
        ReplicationFactor = $ReplicationFactor
        Placements = $placements.ToArray()
        CreatedAt = New-BosTimestamp
    }
    $planHash = Get-BosSha256Hex -Bytes (ConvertTo-BosBytes -Text (Export-BosJson -Value $planCore))

    return [pscustomobject]@{
        PlanId = "bos:placement:$($planHash.Substring(0, 32))"
        ProtocolVersion = $script:BosProtocolVersion
        ManifestId = $Manifest.ManifestId
        ReplicationFactor = $ReplicationFactor
        Placements = $placements.ToArray()
        CreatedAt = $planCore.CreatedAt
    }
}

function Commit-BosPlacementPlan {
    param(
        [Parameter(Mandatory = $true)]$ControlPlane,
        [Parameter(Mandatory = $true)]$Plan
    )

    foreach ($placement in $Plan.Placements) {
        if (-not $ControlPlane.Nodes.Contains($placement.NodeId)) {
            throw "Cannot commit placement for unknown node $($placement.NodeId)."
        }

        $node = $ControlPlane.Nodes[$placement.NodeId]
        $node.UsedBytes = [long]$node.UsedBytes + [long]$placement.Bytes
        $ControlPlane.Commitments.Add($placement) | Out-Null
        $ControlPlane.Ledger.Add([pscustomobject]@{
            Type = 'chunk.placed'
            PlanId = $Plan.PlanId
            ManifestId = $placement.ManifestId
            ChunkId = $placement.ChunkId
            NodeId = $placement.NodeId
            Bytes = $placement.Bytes
            At = New-BosTimestamp
        }) | Out-Null
    }

    return $Plan
}

function Get-BosNetContributionScore {
    param(
        [Parameter(Mandatory = $true)][ValidateRange(0, [long]::MaxValue)][long]$ContributedBytes,
        [Parameter(Mandatory = $true)][ValidateRange(0, [long]::MaxValue)][long]$ConsumedBytes
    )

    $score = [long]$ContributedBytes - [long]$ConsumedBytes
    $class = if ($score -ge 0) { 'producer' } else { 'consumer' }

    return [pscustomobject]@{
        ContributedBytes = [long]$ContributedBytes
        ConsumedBytes = [long]$ConsumedBytes
        ScoreBytes = $score
        Class = $class
    }
}

Export-ModuleMember -Function @(
    'New-BosIdentity',
    'Get-BosIdentityPublicRecord',
    'Sign-BosText',
    'Test-BosSignature',
    'New-BosEncryptedObject',
    'Read-BosEncryptedObject',
    'Assert-BosManifest',
    'New-BosControlPlane',
    'New-BosNode',
    'Register-BosNode',
    'Publish-BosManifest',
    'Test-BosNodeEligible',
    'New-BosPlacementPlan',
    'Commit-BosPlacementPlan',
    'Get-BosNetContributionScore',
    'Export-BosJson'
)
