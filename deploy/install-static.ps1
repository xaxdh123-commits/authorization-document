[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory)][string]$AdminSource,
  [Parameter(Mandatory)][string]$H5Source,
  [Parameter(Mandatory)][string]$TargetRoot,
  [string]$NginxReloadExecutable,
  [string]$SwitchObserverExecutable,
  [string]$PostActivateVerifierExecutable,
  [switch]$Execute,
  [switch]$Approved
)
$ErrorActionPreference = 'Stop'

$admin = (Resolve-Path -LiteralPath $AdminSource).Path
$h5 = (Resolve-Path -LiteralPath $H5Source).Path
$target = [IO.Path]::GetFullPath($TargetRoot).TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $admin 'index.html') -PathType Leaf)) { throw 'Admin build is missing index.html' }
if (-not (Test-Path -LiteralPath (Join-Path $h5 'index.html') -PathType Leaf)) { throw 'H5 build is missing index.html' }
if ([IO.Path]::GetPathRoot($target) -eq $target) { throw 'Target root must not be a drive root' }

$releases = Join-Path $target 'releases'
$pointer = Join-Path $target 'current-release.conf'
Write-Output "VALID ADMIN=$admin"
Write-Output "VALID H5=$h5"
Write-Output "TARGET $target"
Write-Output "CURRENT_POINTER $pointer"
if (-not $Execute) { Write-Output 'DRY_RUN no static files copied'; exit 0 }
if (-not $Approved) { throw 'Execute requires -Approved' }
if (-not $NginxReloadExecutable) { throw 'Execute requires NginxReloadExecutable' }

$nginx = (Get-Command $NginxReloadExecutable -ErrorAction Stop).Source
$observer = if ($SwitchObserverExecutable) { (Get-Command $SwitchObserverExecutable -ErrorAction Stop).Source } else { $null }

New-Item -ItemType Directory -Force -Path $target, $releases | Out-Null
$releaseId = (Get-Date -Format 'yyyyMMddHHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$stage = Join-Path $target ".release-staging-$releaseId"
$release = Join-Path $releases $releaseId
$pointerCandidate = Join-Path $target ".current-release-$releaseId.candidate"
$pointerBackup = Join-Path $target ".current-release-$releaseId.backup"
$pointerChanged = $false
$hadPointer = Test-Path -LiteralPath $pointer -PathType Leaf

try {
  New-Item -ItemType Directory -Path $stage | Out-Null
  Copy-Item -LiteralPath $admin -Destination (Join-Path $stage 'admin') -Recurse
  Copy-Item -LiteralPath $h5 -Destination (Join-Path $stage 'h5') -Recurse
  $files = @(
    Get-ChildItem -LiteralPath $stage -File -Recurse | ForEach-Object {
      [ordered]@{
        path = $_.FullName.Substring($stage.Length + 1).Replace('\', '/')
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        bytes = $_.Length
      }
    }
  )
  [ordered]@{ version = 1; releaseId = $releaseId; createdAt = (Get-Date).ToString('o'); files = $files } |
    ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $stage 'release-manifest.json')
  foreach ($required in @('admin/index.html', 'h5/index.html', 'release-manifest.json')) {
    if (-not (Test-Path -LiteralPath (Join-Path $stage $required) -PathType Leaf)) { throw "Staging verification failed: $required" }
  }

  # A release is immutable once placed under releases/. Switching never moves it.
  Move-Item -LiteralPath $stage -Destination $release
  $releaseForNginx = $release.Replace('\', '/')
  Set-Content -LiteralPath $pointerCandidate -Encoding UTF8 -Value "set `$static_release_root `"$releaseForNginx`";"
  if ($hadPointer) {
    if ($observer) { & $observer -Stage 'BEFORE_POINTER_REPLACE' -TargetRoot $target -ReleaseRoot $release }
    [IO.File]::Replace($pointerCandidate, $pointer, $pointerBackup, $true)
  } else {
    Move-Item -LiteralPath $pointerCandidate -Destination $pointer
  }
  $pointerChanged = $true
  if ($observer) { & $observer -Stage 'AFTER_POINTER_REPLACE' -TargetRoot $target -ReleaseRoot $release }

  & $nginx -t
  if ($LASTEXITCODE -ne 0) { throw 'nginx -t failed after static pointer switch' }
  & $nginx -s reload
  if ($LASTEXITCODE -ne 0) { throw 'nginx reload failed after static pointer switch' }
  if ($observer) { & $observer -Stage 'AFTER_NGINX_RELOAD' -TargetRoot $target -ReleaseRoot $release }

  if ($PostActivateVerifierExecutable) {
    $verifier = (Get-Command $PostActivateVerifierExecutable -ErrorAction Stop).Source
    & $verifier -ReleaseRoot $release
    if (-not $?) { throw 'Post-activation static release verification failed' }
  }

  if (Test-Path -LiteralPath $pointerBackup) { Remove-Item -LiteralPath $pointerBackup -Force }
  Write-Output "STATIC_RELEASE_SWITCHED $releaseId"
} catch {
  $activationError = $_
  if ($pointerChanged) {
    if ($hadPointer -and (Test-Path -LiteralPath $pointerBackup -PathType Leaf)) {
      $rollbackCandidate = "$pointerBackup.rollback"
      $rollbackDiscard = "$pointerBackup.discard"
      Copy-Item -LiteralPath $pointerBackup -Destination $rollbackCandidate
      [IO.File]::Replace($rollbackCandidate, $pointer, $rollbackDiscard, $true)
      if (Test-Path -LiteralPath $rollbackDiscard) { Remove-Item -LiteralPath $rollbackDiscard -Force }
      if ($observer) { & $observer -Stage 'AFTER_POINTER_ROLLBACK' -TargetRoot $target -ReleaseRoot $release }
      & $nginx -t | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'nginx -t failed while rolling back static pointer' }
      & $nginx -s reload | Out-Null
      if ($LASTEXITCODE -ne 0) { throw 'nginx reload failed while rolling back static pointer' }
    } elseif (-not $hadPointer -and (Test-Path -LiteralPath $pointer)) {
      Remove-Item -LiteralPath $pointer -Force
    }
  }
  foreach ($temporary in @($stage, $pointerCandidate, $pointerBackup)) {
    if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Recurse -Force }
  }
  throw $activationError
}
