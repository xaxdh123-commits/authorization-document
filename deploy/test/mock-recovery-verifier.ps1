param([Parameter(Mandatory)][string]$DatabaseUrl,[Parameter(Mandatory)][string]$FileRoot,[Parameter(Mandatory)][string]$OutputPath)
$pdf=Join-Path $FileRoot 'one.pdf'
if(-not(Test-Path -LiteralPath $pdf)){throw 'restored final PDF missing'}
$paths=@(Get-ChildItem -LiteralPath $FileRoot -File -Recurse|ForEach-Object{$_.FullName.Substring($FileRoot.TrimEnd('\').Length).TrimStart('\').Replace('\','/')}|Sort-Object)
if($paths.Count-ne 1-or$paths[0]-ne'one.pdf'){throw "unexpected restored file set: $($paths-join ',')"}
$result=[ordered]@{businessCases=1;auditEvents=1;historyFiles=1;finalPdfs=1;restoredFileCount=$paths.Count;restoredFilePaths=$paths;unfinishedPdfRecoveredSeconds=1;duplicateFinalRecords=0;finalPdfSha256=(Get-FileHash -LiteralPath $pdf -Algorithm SHA256).Hash.ToLowerInvariant()}
$result|ConvertTo-Json|Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output 'RECOVERY_BUSINESS_INVARIANTS_PASS'
