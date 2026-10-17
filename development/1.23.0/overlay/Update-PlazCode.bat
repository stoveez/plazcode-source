@echo off
setlocal
cd /d "%~dp0"
title PlazCode Updater
powershell.exe -NoProfile -File "%~dp0Update-PlazCode.ps1" %*
set "PLAZCODE_UPDATE_RESULT=%ERRORLEVEL%"
echo.
pause
exit /b %PLAZCODE_UPDATE_RESULT%
