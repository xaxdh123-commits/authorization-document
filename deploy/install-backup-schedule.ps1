[CmdletBinding()]
param([string]$BackupAt='02:00',[string]$RecoveryMonths='1,4,7,10',[string]$BackupCommand,[string]$RecoveryCommand,[string]$SchtasksExecutable='schtasks.exe',[switch]$Execute,[switch]$Approved)
$ErrorActionPreference = 'Stop'
if ($BackupAt -notmatch '^([01]\d|2[0-3]):[0-5]\d$') { throw 'BackupAt must use HH:mm' }
$months = $RecoveryMonths.Split(',') | ForEach-Object { [int]$_.Trim() }
if ($months.Count -eq 0 -or ($months | Where-Object { $_ -lt 1 -or $_ -gt 12 })) { throw 'RecoveryMonths must be between 1 and 12' }
Write-Output "VALID DAILY_BACKUP_AT=$BackupAt"
Write-Output "VALID RECOVERY_MONTHS=$($months -join ',')"
if (-not $Execute) { Write-Output 'DRY_RUN no scheduled task, service account, or alert created'; exit 0 }
if(-not $Approved){throw 'Execute requires -Approved'};if(-not $BackupCommand-or-not $RecoveryCommand){throw 'Execute requires explicit BackupCommand and RecoveryCommand'};$schtasks=(Get-Command $SchtasksExecutable -ErrorAction Stop).Source
& $schtasks /Create /F /TN 'Authorization-Daily-Backup' /SC DAILY /ST $BackupAt /TR $BackupCommand;if($LASTEXITCODE-ne 0){throw 'Daily backup schedule creation failed'}
foreach($month in $months){& $schtasks /Create /F /TN "Authorization-Recovery-Drill-M$month" /SC MONTHLY /M $month /D 1 /ST '03:00' /TR $RecoveryCommand;if($LASTEXITCODE-ne 0){throw "Recovery schedule creation failed for month $month"}}
Write-Output 'BACKUP_AND_RECOVERY_SCHEDULES_INSTALLED'
