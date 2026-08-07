param(
  [Parameter(Mandatory)][ValidateSet('Create','Promote','Drop')][string]$Action,
  [Parameter(Mandatory)][string]$StageDatabaseUrl,
  [Parameter(Mandatory)][string]$TargetDatabaseUrl
)
Add-Content -LiteralPath $env:MOCK_DB_LIFECYCLE_LOG -Value "$($Action.ToUpperInvariant())|$StageDatabaseUrl|$TargetDatabaseUrl"
if($Action-eq'Promote'-and$env:MOCK_DB_PROMOTE_FAIL-eq'1'){throw 'MOCK_DATABASE_PROMOTE_FAILURE'}
Write-Output "DATABASE_$($Action.ToUpperInvariant())_OK"
