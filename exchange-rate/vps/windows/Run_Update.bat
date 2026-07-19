@echo off
setlocal
set "HERE=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%HERE%update.ps1" >> "%HERE%exim-update.log" 2>&1
