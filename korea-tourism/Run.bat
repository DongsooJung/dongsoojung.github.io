@echo off
rem Korea tourism data fetch launcher (domestic network)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fetch_local.ps1"
pause
