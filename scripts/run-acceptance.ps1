[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
& node scripts/run-acceptance.mjs
exit $LASTEXITCODE
