@{
    RootModule = 'BharatOS.Phase0.psm1'
    ModuleVersion = '0.1.0'
    GUID = '7fd8bb56-2c8c-4f97-8a31-871a98512f8f'
    Author = 'Bharat OS'
    CompanyName = 'Bharat OS'
    Copyright = '(c) Bharat OS. All rights reserved.'
    Description = 'Phase 0 protocol, identity, encrypted storage, and mesh simulator for Bharat OS.'
    PowerShellVersion = '5.1'
    FunctionsToExport = @(
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
    CmdletsToExport = @()
    VariablesToExport = '*'
    AliasesToExport = @()
}

