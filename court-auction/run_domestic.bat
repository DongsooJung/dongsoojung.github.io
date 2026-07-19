@echo off
REM Court auction data collector - domestic network launcher
REM Korean messages are inside run_domestic.ps1 (UTF-8 BOM)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_domestic.ps1" %*
