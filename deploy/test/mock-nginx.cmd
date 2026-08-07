@echo off
if defined MOCK_NGINX_LOG echo %*>>"%MOCK_NGINX_LOG%"
exit /b 0
