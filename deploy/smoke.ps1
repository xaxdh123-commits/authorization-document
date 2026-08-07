[CmdletBinding()]
param([string]$ApiUrl,[string]$AdminUrl,[string]$H5Url,[switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
$targets = @{ API=$ApiUrl; Admin=$AdminUrl; H5=$H5Url }
foreach ($entry in $targets.GetEnumerator()) {
  if (-not $entry.Value) { Write-Output "SKIP $($entry.Key): URL not configured"; continue }
  $uri = [Uri]$entry.Value
  if ($uri.Scheme -notin @('http','https')) { throw "$($entry.Key) URL scheme is invalid" }
  if ($ValidateOnly) { Write-Output "VALID $($entry.Key) $($uri.AbsoluteUri)"; continue }
  $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec 10
  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) { throw "$($entry.Key) smoke failed: $($response.StatusCode)" }
  Write-Output "PASS $($entry.Key) HTTP $($response.StatusCode)"
}
if ($ValidateOnly) { Write-Output 'GATE_STATUS=NOT_RUN'; Write-Output 'Validation only; no HTTP smoke requests executed' }
