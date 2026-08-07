param([Parameter(Mandatory)][ValidateSet('api','worker')][string]$Service)
Write-Output ($Service.ToUpperInvariant()+'_RESTARTED')
