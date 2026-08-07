$fileArgument=$args|Where-Object{$_ -like '--file=*'}|Select-Object -First 1
if(-not $fileArgument){exit 2}
Set-Content -LiteralPath $fileArgument.Substring(7) -Value 'mock-postgres-dump'
exit 0
