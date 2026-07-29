@echo off
REM Register/remove the daily court-auction scheduled task (Korean UI in .ps1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0schedule_daily.ps1" %*
