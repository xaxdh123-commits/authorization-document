param(
  [Parameter(Mandatory)][string]$Stage,
  [Parameter(Mandatory)][string]$TargetRoot,
  [Parameter(Mandatory)][string]$ReleaseRoot
)
$pointer=Join-Path $TargetRoot 'current-release.conf'
if(-not(Test-Path -LiteralPath $pointer -PathType Leaf)){throw "CURRENT_UNRESOLVABLE $Stage pointer missing"}
$content=Get-Content -Raw -LiteralPath $pointer
if($content-notmatch 'set\s+\$static_release_root\s+"([^"]+)";'){throw "CURRENT_UNRESOLVABLE $Stage pointer invalid"}
$resolved=$Matches[1].Replace('/','\')
foreach($required in @('admin/index.html','h5/index.html','release-manifest.json')){if(-not(Test-Path -LiteralPath (Join-Path $resolved $required) -PathType Leaf)){throw "CURRENT_UNRESOLVABLE $Stage $required"}}
if($Stage-in@('AFTER_POINTER_REPLACE','AFTER_NGINX_RELOAD')-and-not[string]::Equals([IO.Path]::GetFullPath($resolved),[IO.Path]::GetFullPath($ReleaseRoot),[StringComparison]::OrdinalIgnoreCase)){throw "CURRENT_WRONG_RELEASE $Stage"}
Add-Content -LiteralPath $env:MOCK_STATIC_SWITCH_LOG -Value "$Stage|$resolved|$ReleaseRoot"
