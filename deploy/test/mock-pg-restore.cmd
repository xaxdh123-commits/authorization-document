@echo off
if defined MOCK_PG_RESTORE_LOG echo %*>>"%MOCK_PG_RESTORE_LOG%"
exit /b 0
