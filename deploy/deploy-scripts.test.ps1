$ErrorActionPreference='Stop'
function Assert-UnsafeRestoreRejected {
  param([Parameter(Mandatory)][string]$BackupPath,[Parameter(Mandatory)][string]$TargetPath,[Parameter(Mandatory)][string]$ExpectedError,[Parameter(Mandatory)][string]$AllowedRoot)
  New-Item -ItemType Directory -Force -Path $TargetPath|Out-Null
  Set-Content -LiteralPath (Join-Path $TargetPath 'sentinel.txt') -Value 'unchanged'
  $rejected=$false
  try{
    & (Join-Path $PSScriptRoot 'restore.ps1') -BackupPath $BackupPath -TargetDatabaseUrl 'postgresql://u:p@127.0.0.1:5432/app_recovery_drill' -TargetFileRoot $TargetPath -AllowedRoot $AllowedRoot -PgRestoreExecutable (Join-Path $PSScriptRoot 'test/mock-pg-restore.cmd') -RecoveryVerifierExecutable (Join-Path $PSScriptRoot 'test/mock-recovery-verifier.ps1') -Execute -Approved
  }catch{
    if($_.Exception.Message-notmatch$ExpectedError){throw}
    $rejected=$true
  }
  if(-not$rejected){throw 'unsafe backup manifest was accepted'}
  if((Get-Content -Raw -LiteralPath (Join-Path $TargetPath 'sentinel.txt')).Trim()-ne'unchanged'){throw 'unsafe manifest changed the restore target'}
}
function Resolve-CurrentStaticRelease {
  param([Parameter(Mandatory)][string]$TargetRoot)
  $pointer=Join-Path $TargetRoot 'current-release.conf'
  if(-not(Test-Path -LiteralPath $pointer -PathType Leaf)){throw 'current release pointer is missing'}
  $content=Get-Content -Raw -LiteralPath $pointer
  if($content-notmatch 'set\s+\$static_release_root\s+"([^"]+)";'){throw 'current release pointer is invalid'}
  $releasePath=$Matches[1].Replace('/','\')
  foreach($required in @('admin/index.html','h5/index.html','release-manifest.json')){if(-not(Test-Path -LiteralPath (Join-Path $releasePath $required) -PathType Leaf)){throw "current release cannot resolve $required"}}
  (Resolve-Path -LiteralPath $releasePath).Path
}
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path;$root=Join-Path $repo ('tmp/deploy-test-'+[guid]::NewGuid().ToString('N'));$files=Join-Path $root 'files';$backups=Join-Path $root 'backups';$restore=Join-Path $root 'drill/files';$www=Join-Path $root 'www';$summary=Join-Path $root 'recovery-summary.json';$switchLog=Join-Path $root 'static-switch.log';$nginxLog=Join-Path $root 'nginx.log';$dbLifecycleLog=Join-Path $root 'db-lifecycle.log';$pgRestoreLog=Join-Path $root 'pg-restore.log'
try{
  $env:MOCK_STATIC_SWITCH_LOG=$switchLog
  $env:MOCK_NGINX_LOG=$nginxLog
  $env:MOCK_DB_LIFECYCLE_LOG=$dbLifecycleLog
  $env:MOCK_PG_RESTORE_LOG=$pgRestoreLog
  New-Item -ItemType Directory -Force -Path $files,(Join-Path $root 'admin'),(Join-Path $root 'h5'),(Join-Path $root 'nginx/conf')|Out-Null;Set-Content -LiteralPath (Join-Path $files 'one.pdf') -Value '%PDF-1.4';Set-Content -LiteralPath (Join-Path $root 'admin/index.html') -Value 'release-1';Set-Content -LiteralPath (Join-Path $root 'h5/index.html') -Value 'release-1';Set-Content -LiteralPath (Join-Path $root 'cert.pem') -Value cert;Set-Content -LiteralPath (Join-Path $root 'key.pem') -Value key
  & (Join-Path $PSScriptRoot 'install-static.ps1') -AdminSource (Join-Path $root 'admin') -H5Source (Join-Path $root 'h5') -TargetRoot $www -NginxReloadExecutable (Join-Path $PSScriptRoot 'test/mock-nginx.cmd') -SwitchObserverExecutable (Join-Path $PSScriptRoot 'test/mock-static-switch-observer.ps1') -Execute -Approved
  $releaseRoot1=Resolve-CurrentStaticRelease -TargetRoot $www
  if(-not$releaseRoot1.StartsWith((Join-Path $www 'releases')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'current does not resolve to an immutable release entity'}
  $release1=Get-Content -Raw -LiteralPath (Join-Path $releaseRoot1 'release-manifest.json')|ConvertFrom-Json
  if(@($release1.files.path|Sort-Object) -join ',' -ne 'admin/index.html,h5/index.html'){throw 'release manifest must describe the complete admin+h5 release'}

  Set-Content -LiteralPath (Join-Path $root 'admin/index.html') -Value 'release-2'
  Set-Content -LiteralPath (Join-Path $root 'h5/index.html') -Value 'release-2'
  & (Join-Path $PSScriptRoot 'install-static.ps1') -AdminSource (Join-Path $root 'admin') -H5Source (Join-Path $root 'h5') -TargetRoot $www -NginxReloadExecutable (Join-Path $PSScriptRoot 'test/mock-nginx.cmd') -SwitchObserverExecutable (Join-Path $PSScriptRoot 'test/mock-static-switch-observer.ps1') -Execute -Approved
  $releaseRoot2=Resolve-CurrentStaticRelease -TargetRoot $www
  $release2=Get-Content -Raw -LiteralPath (Join-Path $releaseRoot2 'release-manifest.json')|ConvertFrom-Json
  if($release2.releaseId-eq$release1.releaseId){throw 'release id did not change'}
  if((Get-Content -Raw -LiteralPath (Join-Path $releaseRoot2 'admin/index.html')).Trim()-ne'release-2'-or(Get-Content -Raw -LiteralPath (Join-Path $releaseRoot2 'h5/index.html')).Trim()-ne'release-2'){throw 'current exposes mixed static versions'}
  if(-not(Test-Path -LiteralPath $releaseRoot1 -PathType Container)){throw 'previous immutable release was moved or removed'}

  Set-Content -LiteralPath (Join-Path $root 'admin/index.html') -Value 'release-3'
  Set-Content -LiteralPath (Join-Path $root 'h5/index.html') -Value 'release-3'
  $activationFailed=$false
  try{
    & (Join-Path $PSScriptRoot 'install-static.ps1') -AdminSource (Join-Path $root 'admin') -H5Source (Join-Path $root 'h5') -TargetRoot $www -NginxReloadExecutable (Join-Path $PSScriptRoot 'test/mock-nginx.cmd') -SwitchObserverExecutable (Join-Path $PSScriptRoot 'test/mock-static-switch-observer.ps1') -PostActivateVerifierExecutable (Join-Path $PSScriptRoot 'test/mock-static-release-failure.ps1') -Execute -Approved
  }catch{
    if($_.Exception.Message-notmatch'MOCK_POST_ACTIVATE_FAILURE'){throw}
    $activationFailed=$true
  }
  if(-not$activationFailed){throw 'post-activation failure was not exercised'}
  $rolledBackRoot=Resolve-CurrentStaticRelease -TargetRoot $www
  $rolledBack=Get-Content -Raw -LiteralPath (Join-Path $rolledBackRoot 'release-manifest.json')|ConvertFrom-Json
  if($rolledBack.releaseId-ne$release2.releaseId-or$rolledBackRoot-ne$releaseRoot2){throw 'atomic pointer rollback did not restore the prior current release'}
  $switchStages=@(Get-Content -LiteralPath $switchLog|ForEach-Object{($_-split '\|')[0]})
  foreach($requiredStage in @('BEFORE_POINTER_REPLACE','AFTER_POINTER_REPLACE','AFTER_NGINX_RELOAD','AFTER_POINTER_ROLLBACK')){if($switchStages-notcontains$requiredStage){throw "missing static switch stage: $requiredStage"}}
  if((Get-ChildItem -LiteralPath (Join-Path $www 'releases') -Directory).Count-lt 3){throw 'release entities were moved or deleted during switch/rollback'}
  $reloads=@(Get-Content -LiteralPath $nginxLog|Where-Object{$_-match'-s reload'})
  if($reloads.Count-lt 3){throw 'nginx was not reloaded after pointer switch and rollback'}
  New-Item -ItemType Directory -Force -Path (Join-Path $restore 'obsolete')|Out-Null
  Set-Content -LiteralPath (Join-Path $restore 'legacy.pdf') -Value 'old-release'
  Set-Content -LiteralPath (Join-Path $restore 'obsolete/stale.txt') -Value 'old-release'
  $drillOutput=& (Join-Path $PSScriptRoot 'recovery-drill.ps1') -DrillDatabaseUrl 'postgresql://u:p@127.0.0.1:5432/app_recovery_drill' -DrillFileRoot $restore -BackupRoot $backups -AllowedRoot $root -SourceDatabaseUrl 'postgresql://u:p@127.0.0.1:5432/app' -SourceFileRoot $files -PgDumpExecutable (Join-Path $PSScriptRoot 'test/mock-pg-dump.ps1') -PgRestoreExecutable (Join-Path $PSScriptRoot 'test/mock-pg-restore.cmd') -StageDatabaseExecutable (Join-Path $PSScriptRoot 'test/mock-database-lifecycle.ps1') -PromoteDatabaseExecutable (Join-Path $PSScriptRoot 'test/mock-database-lifecycle.ps1') -DropDatabaseExecutable (Join-Path $PSScriptRoot 'test/mock-database-lifecycle.ps1') -RecoveryVerifierExecutable (Join-Path $PSScriptRoot 'test/mock-recovery-verifier.ps1') -ApiRestartExecutable (Join-Path $PSScriptRoot 'test/mock-restart.ps1') -WorkerRestartExecutable (Join-Path $PSScriptRoot 'test/mock-restart.ps1') -SummaryPath $summary -Execute -Approved
  $drillText=$drillOutput -join "`n";foreach($marker in @('RECOVERY_BUSINESS_INVARIANTS_PASS','API_RESTARTED','WORKER_RESTARTED','RECOVERY_DRILL_COMPLETED')){if(-not $drillText.Contains($marker)){throw "missing recovery marker: $marker"}}
  if(-not(Test-Path -LiteralPath $summary)){throw 'recovery summary missing'};$evidence=Get-Content -Raw -LiteralPath $summary|ConvertFrom-Json;if($evidence.status-ne'PASS'-or$evidence.rpoHours-lt 0-or$evidence.rpoHours-gt 24-or$evidence.rtoHours-lt 0-or$evidence.rtoHours-gt 8-or$evidence.unfinishedPdfRecoveredSeconds-gt 60-or$evidence.duplicateFinalRecords-ne 0){throw 'recovery evidence failed acceptance limits'}
  if((Get-FileHash -LiteralPath (Join-Path $files 'one.pdf')).Hash-ne(Get-FileHash -LiteralPath (Join-Path $restore 'one.pdf')).Hash){throw 'restored file hash differs'}
  if((Test-Path -LiteralPath (Join-Path $restore 'legacy.pdf'))-or(Test-Path -LiteralPath (Join-Path $restore 'obsolete/stale.txt'))){throw 'clean restore retained files outside the manifest'}
  $businessEvidence=Get-Content -Raw -LiteralPath (Join-Path $root 'recovery-business-verification.json')|ConvertFrom-Json
  if($businessEvidence.restoredFileCount-ne 1-or@($businessEvidence.restoredFilePaths)-join ','-ne'one.pdf'){throw 'business verifier did not report exact restored paths and count'}
  $successDbEvents=@(Get-Content -LiteralPath $dbLifecycleLog)
  if(@($successDbEvents|Where-Object{$_-match'^CREATE\|'}).Count-ne 1-or@($successDbEvents|Where-Object{$_-match'^PROMOTE\|'}).Count-ne 1-or@($successDbEvents|Where-Object{$_-match'^DROP\|'}).Count-ne 0){throw 'successful restore did not create and promote the stage database exactly once'}
  $restoreInvocation=(Get-Content -Raw -LiteralPath $pgRestoreLog).Trim()
  if($restoreInvocation-match'--clean'-or$restoreInvocation-notmatch'--dbname=postgresql://[^\s]*/app_recovery_drill_stage_[a-f0-9]+'){throw 'pg_restore did not target an isolated stage database'}

  $latest=Get-ChildItem -LiteralPath $backups -Directory|Sort-Object Name -Descending|Select-Object -First 1
  $manifestPath=Join-Path $latest.FullName 'sha256-manifest.json'
  $originalManifestText=Get-Content -Raw -LiteralPath $manifestPath
  $outsideDump=Join-Path $backups 'outside.dump'
  Set-Content -LiteralPath $outsideDump -Value 'escaped-dump'
  $manifest=$originalManifestText|ConvertFrom-Json
  $manifest.database.path='../outside.dump'
  $manifest.database.sha256=(Get-FileHash -LiteralPath $outsideDump -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $manifestPath -Encoding utf8
  Assert-UnsafeRestoreRejected -BackupPath $latest.FullName -TargetPath (Join-Path $root 'unsafe-database') -ExpectedError 'Unsafe manifest path' -AllowedRoot $root

  $outsidePdf=Join-Path $latest.FullName 'outside.pdf'
  Set-Content -LiteralPath $outsidePdf -Value 'escaped-pdf'
  $manifest=$originalManifestText|ConvertFrom-Json
  $manifest.files[0].path='../outside.pdf'
  $manifest.files[0].sha256=(Get-FileHash -LiteralPath $outsidePdf -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $manifestPath -Encoding utf8
  Assert-UnsafeRestoreRejected -BackupPath $latest.FullName -TargetPath (Join-Path $root 'unsafe-parent') -ExpectedError 'Unsafe manifest path' -AllowedRoot $root

  $absolutePdf=Join-Path $root 'absolute.pdf'
  Set-Content -LiteralPath $absolutePdf -Value 'absolute-pdf'
  $manifest=$originalManifestText|ConvertFrom-Json
  $manifest.files[0].path=$absolutePdf
  $manifest.files[0].sha256=(Get-FileHash -LiteralPath $absolutePdf -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $manifestPath -Encoding utf8
  Assert-UnsafeRestoreRejected -BackupPath $latest.FullName -TargetPath (Join-Path $root 'unsafe-absolute') -ExpectedError 'Unsafe manifest path' -AllowedRoot $root

  New-Item -ItemType Directory -Force -Path (Join-Path $latest.FullName 'files/nested')|Out-Null
  $manifest=$originalManifestText|ConvertFrom-Json
  $manifest.files[0].path='nested/../../outside.pdf'
  $manifest.files[0].sha256=(Get-FileHash -LiteralPath $outsidePdf -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $manifestPath -Encoding utf8
  Assert-UnsafeRestoreRejected -BackupPath $latest.FullName -TargetPath (Join-Path $root 'unsafe-escape') -ExpectedError 'Unsafe manifest path' -AllowedRoot $root
  Set-Content -LiteralPath $manifestPath -Value $originalManifestText -Encoding utf8

  $rollbackTarget=Join-Path $root 'restore-rollback'
  New-Item -ItemType Directory -Force -Path $rollbackTarget|Out-Null
  Set-Content -LiteralPath (Join-Path $rollbackTarget 'stable.pdf') -Value 'stable-before-restore'
  Clear-Content -LiteralPath $dbLifecycleLog
  Clear-Content -LiteralPath $pgRestoreLog
  $restoreFailed=$false
  try{
    & (Join-Path $PSScriptRoot 'restore.ps1') -BackupPath $latest.FullName -TargetDatabaseUrl 'postgresql://u:p@127.0.0.1:5432/app_recovery_drill' -TargetFileRoot $rollbackTarget -AllowedRoot $root -PgRestoreExecutable (Join-Path $PSScriptRoot 'test/mock-pg-restore.cmd') -StageDatabaseExecutable (Join-Path $PSScriptRoot 'test/mock-database-lifecycle.ps1') -PromoteDatabaseExecutable (Join-Path $PSScriptRoot 'test/mock-database-lifecycle.ps1') -DropDatabaseExecutable (Join-Path $PSScriptRoot 'test/mock-database-lifecycle.ps1') -RecoveryVerifierExecutable (Join-Path $PSScriptRoot 'test/mock-recovery-verifier-failure.ps1') -Execute -Approved
  }catch{
    if($_.Exception.Message-notmatch'MOCK_RECOVERY_VERIFIER_FAILURE'){throw}
    $restoreFailed=$true
  }
  if(-not$restoreFailed){throw 'recovery verifier failure was not exercised'}
  if((Get-Content -Raw -LiteralPath (Join-Path $rollbackTarget 'stable.pdf')).Trim()-ne'stable-before-restore'-or(Test-Path -LiteralPath (Join-Path $rollbackTarget 'one.pdf'))){throw 'restore rollback did not restore the exact previous target'}
  $failedDbEvents=@(Get-Content -LiteralPath $dbLifecycleLog)
  if(@($failedDbEvents|Where-Object{$_-match'^CREATE\|'}).Count-ne 1-or@($failedDbEvents|Where-Object{$_-match'^PROMOTE\|'}).Count-ne 0-or@($failedDbEvents|Where-Object{$_-match'^DROP\|'}).Count-ne 1){throw 'verification failure must drop stage database without promoting'}
  $failedRestoreInvocation=(Get-Content -Raw -LiteralPath $pgRestoreLog).Trim()
  if($failedRestoreInvocation-match'--clean'-or$failedRestoreInvocation-notmatch'_recovery_drill_stage_[a-f0-9]+'){throw 'failed restore touched the target database directly'}
  & (Join-Path $PSScriptRoot 'install-nginx.ps1') -Template (Join-Path $PSScriptRoot 'nginx.example.conf') -NginxRoot (Join-Path $root 'nginx') -StaticRoot $www -CertificatePath (Join-Path $root 'cert.pem') -CertificateKeyPath (Join-Path $root 'key.pem') -NginxExecutable (Join-Path $PSScriptRoot 'test/mock-nginx.cmd') -ConfigPath (Join-Path $root 'nginx/conf/authorization.conf') -Execute -Approved
  $nginxConfig=Get-Content -Raw -LiteralPath (Join-Path $root 'nginx/conf/authorization.conf')
  if($nginxConfig-notmatch'include\s+[^;]*current-release\.conf;'-or$nginxConfig-notmatch'alias\s+\$static_release_root/admin/'-or$nginxConfig-notmatch'alias\s+\$static_release_root/h5/'){throw 'nginx does not resolve the atomic release pointer'}
  if($nginxConfig-notmatch'limit_req_zone\s+\$binary_remote_addr\s+zone=health_limit:10m\s+rate=\d+r/s;'-or$nginxConfig-notmatch'location\s+=\s+/api/health\s*\{[^}]*limit_req\s+zone=health_limit\s+burst=\d+\s+nodelay;' ){throw 'nginx health endpoint rate limit is missing'}
  Write-Output 'DEPLOY_SCRIPT_TEMP_MOCK_TEST_PASS'
}finally{
  Remove-Item Env:MOCK_STATIC_SWITCH_LOG,Env:MOCK_NGINX_LOG,Env:MOCK_DB_LIFECYCLE_LOG,Env:MOCK_PG_RESTORE_LOG -ErrorAction SilentlyContinue
  $resolved=[IO.Path]::GetFullPath($root);$allowed=[IO.Path]::GetFullPath((Join-Path $repo 'tmp')).TrimEnd('\')+'\';if($resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)-and(Test-Path -LiteralPath $resolved)){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
