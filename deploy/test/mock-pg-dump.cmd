@echo off
setlocal EnableDelayedExpansion
for %%A in (%*) do (
  set "ARG=%%~A"
  if "!ARG:~0,7!"=="--file=" set "DUMP=!ARG:~7!"
)
if not defined DUMP exit /b 2
echo mock-postgres-dump>"%DUMP%"
exit /b 0
