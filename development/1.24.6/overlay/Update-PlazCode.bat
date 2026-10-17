@echo off
setlocal
rem Windows PowerShell must resolve its own built-in modules.
set "PSModulePath="
cd /d "%~dp0"
title PlazCode Updater
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-PlazCode.ps1" %*
set "PLAZCODE_UPDATE_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %PLAZCODE_UPDATE_RESULT%
