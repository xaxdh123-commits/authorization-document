[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$BackupPath,
  [Parameter(Mandatory)][string]$TargetDatabaseUrl,
  [Parameter(Mandatory)][string]$TargetFileRoot,
  [Parameter(Mandatory)][string]$AllowedRoot,
  [string]$PgRestoreExecutable = 'pg_restore',
  [string]$StageDatabaseExecutable,
  [string]$PromoteDatabaseExecutable,
  [string]$DropDatabaseExecutable,
  [string]$RecoveryVerifierExecutable,
  [string]$VerificationOutputPath,
  [switch]$Execute,
  [switch]$Approved
)
$ErrorActionPreference = 'Stop'

function Resolve-SafeManifestPath {
  param(
    [Parameter(Mandatory)][string]$Root,
    [Parameter(Mandatory)][AllowEmptyString()][string]$ManifestPath,
    [Parameter(Mandatory)][string]$Label
  )
  if ([string]::IsNullOrWhiteSpace($ManifestPath) -or [IO.Path]::IsPathRooted($ManifestPath) -or $ManifestPath -match '^[A-Za-z]:' -or $ManifestPath.Contains(':')) {
    throw "Unsafe manifest path ($Label): $ManifestPath"
  }
  $segments = @($ManifestPath -split '[\\/]')
  if ($segments.Count -eq 0 -or @($segments | Where-Object { [string]::IsNullOrWhiteSpace($_) -or $_ -eq '.' -or $_ -eq '..' }).Count -gt 0) {
    throw "Unsafe manifest path ($Label): $ManifestPath"
  }
  $relative = [string]::Join([IO.Path]::DirectorySeparatorChar, $segments)
  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $full = [IO.Path]::GetFullPath((Join-Path $rootFull $relative))
  if (-not $full.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe manifest path ($Label): $ManifestPath"
  }
  [pscustomobject]@{ relative = $segments -join '/'; fullPath = $full }
}

function Assert-ExactFileSet {
  param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][string[]]$ExpectedPaths,[Parameter(Mandatory)][string]$Label)
  $actual = @(
    Get-ChildItem -LiteralPath $Root -File -Recurse | ForEach-Object {
      $_.FullName.Substring($Root.Length).TrimStart('\').Replace('\', '/')
    } | Sort-Object
  )
  $expected = @($ExpectedPaths | Sort-Object)
  if ($actual.Count -ne $expected.Count) { throw "$Label file count mismatch: expected $($expected.Count), actual $($actual.Count)" }
  for ($index = 0; $index -lt $expected.Count; $index++) {
    if (-not [string]::Equals($actual[$index], $expected[$index], [StringComparison]::OrdinalIgnoreCase)) {
      throw "$Label file path mismatch: expected $($expected[$index]), actual $($actual[$index])"
    }
  }
}

$databaseName = ([Uri]$TargetDatabaseUrl).AbsolutePath.Trim('/')
if (-not $databaseName.EndsWith('_recovery_drill')) { throw 'Target database must end with _recovery_drill' }
$allowed = [IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\')
$target = [IO.Path]::GetFullPath($TargetFileRoot).TrimEnd('\')
$backup = [IO.Path]::GetFullPath($BackupPath).TrimEnd('\')
if (-not $target.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Target file root must be below AllowedRoot' }
if ($target -eq $backup -or $target.StartsWith($backup + '\', [StringComparison]::OrdinalIgnoreCase) -or $backup.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Target file root and backup path must not overlap' }

Write-Output "VALID DATABASE=$databaseName"
Write-Output "VALID TARGET=$target"
Write-Output 'PLAN validate manifest paths and SHA-256; restore clean staging; atomically replace target; verify exact business files'
if (-not $Execute) { Write-Output 'DRY_RUN no database or file overwrite'; exit 0 }
if (-not $Approved) { throw 'Execute requires -Approved' }
if (-not $RecoveryVerifierExecutable) { throw 'Execute requires RecoveryVerifierExecutable' }

$manifestPath = Join-Path $backup 'sha256-manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'Backup manifest missing' }
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
if ($null -eq $manifest.database -or $null -eq $manifest.files) { throw 'Backup manifest is incomplete' }

# All paths are rejected or normalized before any dump/file is read or any restore command runs.
$databaseEntry = Resolve-SafeManifestPath -Root $backup -ManifestPath ([string]$manifest.database.path) -Label 'database'
$fileEntries = @()
$seenPaths = @{}
foreach ($entry in @($manifest.files)) {
  $safe = Resolve-SafeManifestPath -Root (Join-Path $backup 'files') -ManifestPath ([string]$entry.path) -Label 'file'
  if ($seenPaths.ContainsKey($safe.relative)) { throw "Duplicate manifest file path: $($safe.relative)" }
  $seenPaths[$safe.relative] = $true
  $fileEntries += [pscustomobject]@{ relative = $safe.relative; fullPath = $safe.fullPath; sha256 = ([string]$entry.sha256).ToLowerInvariant() }
}
if ($fileEntries.Count -lt 1) { throw 'Backup manifest has no files' }

if (-not (Test-Path -LiteralPath $databaseEntry.fullPath -PathType Leaf)) { throw 'Database dump is missing' }
if ((Get-FileHash -LiteralPath $databaseEntry.fullPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$manifest.database.sha256).ToLowerInvariant()) { throw 'Database dump SHA-256 mismatch' }
foreach ($entry in $fileEntries) {
  if (-not (Test-Path -LiteralPath $entry.fullPath -PathType Leaf)) { throw "Manifest file is missing: $($entry.relative)" }
  if ((Get-FileHash -LiteralPath $entry.fullPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $entry.sha256) { throw "File SHA-256 mismatch: $($entry.relative)" }
}

if (-not $VerificationOutputPath) { $VerificationOutputPath = "$target.recovery-verification.json" }
$verificationFullPath = [IO.Path]::GetFullPath($VerificationOutputPath)
if (-not $verificationFullPath.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'VerificationOutputPath must be below AllowedRoot' }
if ($verificationFullPath.StartsWith($target + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'VerificationOutputPath must be outside TargetFileRoot' }
if (-not $StageDatabaseExecutable -or -not $PromoteDatabaseExecutable -or -not $DropDatabaseExecutable) { throw 'Execute requires stage, promote, and drop database executables' }

$targetParent = Split-Path -Parent $target
New-Item -ItemType Directory -Force -Path $targetParent | Out-Null
$operationId = [guid]::NewGuid().ToString('N').Substring(0, 12)
$stageDatabaseName = "${databaseName}_stage_$operationId"
$stageDatabaseBuilder = [UriBuilder]$TargetDatabaseUrl
$stageDatabaseBuilder.Path = "/$stageDatabaseName"
$stageDatabaseUrl = $stageDatabaseBuilder.Uri.AbsoluteUri
$stage = Join-Path $targetParent ('.' + (Split-Path -Leaf $target) + ".restore-staging-$operationId")
$rollback = Join-Path $targetParent ('.' + (Split-Path -Leaf $target) + ".restore-rollback-$operationId")
$oldTargetMoved = $false
$newTargetActivated = $false
$stageDatabaseMayExist = $false
$databasePromoted = $false
$stageDatabaseCommand = (Get-Command $StageDatabaseExecutable -ErrorAction Stop).Source
$promoteDatabaseCommand = (Get-Command $PromoteDatabaseExecutable -ErrorAction Stop).Source
$dropDatabaseCommand = (Get-Command $DropDatabaseExecutable -ErrorAction Stop).Source
$pg = (Get-Command $PgRestoreExecutable -ErrorAction Stop).Source
$verifier = (Get-Command $RecoveryVerifierExecutable -ErrorAction Stop).Source

try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  foreach ($entry in $fileEntries) {
    $destination = Join-Path $stage $entry.relative
    $destinationParent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
    Copy-Item -LiteralPath $entry.fullPath -Destination $destination
  }
  $expectedPaths = @($fileEntries.relative)
  Assert-ExactFileSet -Root $stage -ExpectedPaths $expectedPaths -Label 'Restore staging'

  Write-Output "STAGE DATABASE=$stageDatabaseName"
  $stageDatabaseMayExist = $true
  & $stageDatabaseCommand -Action Create -StageDatabaseUrl $stageDatabaseUrl -TargetDatabaseUrl $TargetDatabaseUrl
  if (-not $?) { throw 'Stage database creation failed' }
  & $pg "--dbname=$stageDatabaseUrl" $databaseEntry.fullPath
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed' }

  if (Test-Path -LiteralPath $verificationFullPath) { Remove-Item -LiteralPath $verificationFullPath -Force }
  $verifierOutput = & $verifier -DatabaseUrl $stageDatabaseUrl -FileRoot $stage -OutputPath $verificationFullPath
  if (-not $?) { throw 'Recovery business verifier failed' }
  $verifierOutput | Write-Output
  if (-not (Test-Path -LiteralPath $verificationFullPath -PathType Leaf)) { throw 'Recovery business verifier produced no evidence' }
  $verification = Get-Content -Raw -LiteralPath $verificationFullPath | ConvertFrom-Json
  if ($verification.businessCases -lt 1 -or $verification.auditEvents -lt 1 -or $verification.historyFiles -lt 1 -or $verification.finalPdfs -lt 1) { throw 'Recovery business invariants failed' }
  $verifiedPaths = @($verification.restoredFilePaths | ForEach-Object { [string]$_ })
  if ([int]$verification.restoredFileCount -ne $expectedPaths.Count) { throw 'Recovery business verifier file count mismatch' }
  if ($verifiedPaths.Count -ne $expectedPaths.Count) { throw 'Recovery business verifier file path count mismatch' }
  Assert-ExactFileSet -Root $stage -ExpectedPaths $verifiedPaths -Label 'Business verification'

  if (Test-Path -LiteralPath $target) {
    Move-Item -LiteralPath $target -Destination $rollback
    $oldTargetMoved = $true
  }
  Move-Item -LiteralPath $stage -Destination $target
  $newTargetActivated = $true
  Assert-ExactFileSet -Root $target -ExpectedPaths $expectedPaths -Label 'Activated restore'

  Assert-ExactFileSet -Root $target -ExpectedPaths $verifiedPaths -Label 'Business verification'

  # Promotion is the final gated mutation. The injected command owns the atomic DB swap.
  & $promoteDatabaseCommand -Action Promote -StageDatabaseUrl $stageDatabaseUrl -TargetDatabaseUrl $TargetDatabaseUrl
  if (-not $?) { throw 'Stage database promotion failed' }
  $databasePromoted = $true
  if ($oldTargetMoved -and (Test-Path -LiteralPath $rollback)) { Remove-Item -LiteralPath $rollback -Recurse -Force -ErrorAction SilentlyContinue }
  Write-Output 'RESTORE_VERIFIED_AND_COMPLETED'
} catch {
  $restoreError = $_
  $cleanupErrors = @()
  try {
    if ($newTargetActivated -and (Test-Path -LiteralPath $target)) { Remove-Item -LiteralPath $target -Recurse -Force }
    if ($oldTargetMoved -and (Test-Path -LiteralPath $rollback)) { Move-Item -LiteralPath $rollback -Destination $target }
    if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
  } catch { $cleanupErrors += $_.Exception.Message }
  if ($stageDatabaseMayExist -and -not $databasePromoted) {
    try {
      & $dropDatabaseCommand -Action Drop -StageDatabaseUrl $stageDatabaseUrl -TargetDatabaseUrl $TargetDatabaseUrl | Write-Output
      if (-not $?) { throw 'Stage database drop failed' }
    } catch { $cleanupErrors += $_.Exception.Message }
  }
  if ($cleanupErrors.Count -gt 0) { throw "$($restoreError.Exception.Message); cleanup failed: $($cleanupErrors -join '; ')" }
  throw $restoreError
}
