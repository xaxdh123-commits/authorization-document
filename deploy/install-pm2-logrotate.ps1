[CmdletBinding(SupportsShouldProcess)]
param([ValidateRange(1,365)][int]$RetainDays=30,[ValidateRange(1,1024)][int]$MaxSizeMb=50,[switch]$Execute,[switch]$Approved)
$ErrorActionPreference='Stop'
Write-Output "VALID PM2_LOGROTATE retain=$RetainDays maxSize=${MaxSizeMb}M"
if (-not $Execute) { Write-Output 'DRY_RUN pm2-logrotate was not installed or changed'; exit 0 }
if (-not $Approved) { throw 'Execute requires -Approved' }
if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) { throw 'pm2 not found' }
& pm2 install pm2-logrotate
if ($LASTEXITCODE -ne 0) { throw 'pm2-logrotate install failed' }
& pm2 set pm2-logrotate:max_size "${MaxSizeMb}M"
& pm2 set pm2-logrotate:retain $RetainDays
& pm2 set pm2-logrotate:compress true
if ($LASTEXITCODE -ne 0) { throw 'pm2-logrotate configuration failed' }
Write-Output 'PM2_LOGROTATE_CONFIGURED'
