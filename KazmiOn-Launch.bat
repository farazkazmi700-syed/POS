@echo off
setlocal
title KazmiOn POS Launcher
cd /d "%~dp0"
echo Starting KazmiOn POS. The first run may take several minutes while Docker builds the app.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0KazmiOn-Start.ps1" %*
if errorlevel 1 (
  echo.
  echo KazmiOn could not start. Review KazmiOn-startup.log.
  pause
)
endlocal
