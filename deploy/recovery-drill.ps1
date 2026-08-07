[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$DrillDatabaseUrl,
  [Parameter(Mandatory)][string]$DrillFileRoot,
  [Parameter(Mandatory)][string]$BackupRoot,
  [Parameter(Mandatory)][string]$AllowedRoot,
  [string]$SourceDatabaseUrl,
  [string]$SourceFileRoot,
  [string]$PgDumpExecutable = 'pg_dump',
  [string]$PgRestoreExecutable = 'pg_restore',
  [string]$StageDatabaseExecutable,
  [string]$PromoteDatabaseExecutable,
  [string]$DropDatabaseExecutable,
  [string]$RecoveryVerifierExecutable,
  [string]$ApiRestartExecutable,
  [string]$WorkerRestartExecutable,
  [string]$SummaryPath,
  [switch]$ValidateOnly,
  [switch]$Execute,
  [switch]$Approved
)
$ErrorActionPreference = 'Stop'
$startedAt = Get-Date
$databaseName = ([Uri]$DrillDatabaseUrl).AbsolutePath.Trim('/')
if (-not $databaseName.EndsWith('_recovery_drill')) { throw 'Drill database must end with _recovery_drill' }
$allowed = [IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\')
$files = [IO.Path]::GetFullPath($DrillFileRoot).TrimEnd('\')
$backup = [IO.Path]::GetFullPath($BackupRoot).TrimEnd('\')
foreach ($candidate in @($files, $backup)) { if (-not $candidate.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Drill paths must be below AllowedRoot' } }
if ($files -eq $backup) { throw 'Drill file root and backup root must differ' }
Write-Output "VALID DATABASE=$databaseName"
Write-Output "VALID FILE_ROOT=$files"
Write-Output "VALID BACKUP_ROOT=$backup"
Write-Output 'TARGET RPO<=24h RTO<=8h PDF_RECOVERY<=60s DUPLICATE_FINAL=0'
if ($ValidateOnly -or -not $Execute) { Write-Output 'GATE_STATUS=NOT_RUN'; Write-Output 'Validation only; no backup, restore, restart, or write'; exit 0 }
if (-not $Approved) { throw 'Execute requires -Approved' }
if (-not $SourceDatabaseUrl -or -not $SourceFileRoot) { throw 'Execute requires SourceDatabaseUrl and SourceFileRoot' }
if (-not $StageDatabaseExecutable -or -not $PromoteDatabaseExecutable -or -not $DropDatabaseExecutable -or -not $RecoveryVerifierExecutable -or -not $ApiRestartExecutable -or -not $WorkerRestartExecutable -or -not $SummaryPath) { throw 'Execute requires database lifecycle, verifier, restart executables, and SummaryPath' }
$summaryFullPath = [IO.Path]::GetFullPath($SummaryPath)
if (-not $summaryFullPath.StartsWith($allowed + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'SummaryPath must be below AllowedRoot' }

& (Join-Path $PSScriptRoot 'backup.ps1') -DatabaseUrl $SourceDatabaseUrl -FileRoot $SourceFileRoot -BackupRoot $backup -PgDumpExecutable $PgDumpExecutable -Execute -Approved
if (-not $?) { throw 'Recovery drill backup failed' }
$latest = Get-ChildItem -LiteralPath $backup -Directory | Sort-Object Name -Descending | Select-Object -First 1
$manifest = Get-Content -Raw -LiteralPath (Join-Path $latest.FullName 'sha256-manifest.json') | ConvertFrom-Json
$verificationPath = Join-Path $allowed 'recovery-business-verification.json'
& (Join-Path $PSScriptRoot 'restore.ps1') -BackupPath $latest.FullName -TargetDatabaseUrl $DrillDatabaseUrl -TargetFileRoot $files -AllowedRoot $allowed -PgRestoreExecutable $PgRestoreExecutable -StageDatabaseExecutable $StageDatabaseExecutable -PromoteDatabaseExecutable $PromoteDatabaseExecutable -DropDatabaseExecutable $DropDatabaseExecutable -RecoveryVerifierExecutable $RecoveryVerifierExecutable -VerificationOutputPath $verificationPath -Execute -Approved
if (-not $?) { throw 'Recovery drill restore failed' }

$apiRestart = (Get-Command $ApiRestartExecutable -ErrorAction Stop).Source
$workerRestart = (Get-Command $WorkerRestartExecutable -ErrorAction Stop).Source
& $apiRestart -Service api
if (-not $?) { throw 'API restart failed' }
& $workerRestart -Service worker
if (-not $?) { throw 'Worker restart failed' }

$verification = Get-Content -Raw -LiteralPath $verificationPath | ConvertFrom-Json
$completedAt = Get-Date
$backupCreatedAt = [DateTimeOffset]::Parse($manifest.createdAt).LocalDateTime
$rpoHours = [Math]::Round([Math]::Max(0, ($startedAt - $backupCreatedAt).TotalHours), 6)
$rtoHours = [Math]::Round(($completedAt - $startedAt).TotalHours, 6)
$status = if ($rpoHours -le 24 -and $rtoHours -le 8 -and $verification.unfinishedPdfRecoveredSeconds -le 60 -and $verification.duplicateFinalRecords -eq 0) { 'PASS' } else { 'FAIL' }
$summary = [ordered]@{
  status = $status
  startedAt = $startedAt.ToString('o')
  completedAt = $completedAt.ToString('o')
  backupCreatedAt = $backupCreatedAt.ToString('o')
  rpoHours = $rpoHours
  rtoHours = $rtoHours
  unfinishedPdfRecoveredSeconds = $verification.unfinishedPdfRecoveredSeconds
  duplicateFinalRecords = $verification.duplicateFinalRecords
  businessCases = $verification.businessCases
  auditEvents = $verification.auditEvents
  historyFiles = $verification.historyFiles
  finalPdfs = $verification.finalPdfs
  finalPdfSha256 = $verification.finalPdfSha256
}
$summary | ConvertTo-Json | Set-Content -LiteralPath $summaryFullPath -Encoding utf8
if ($status -ne 'PASS') { throw 'Recovery drill exceeded acceptance limits' }
Write-Output 'RECOVERY_DRILL_COMPLETED'
