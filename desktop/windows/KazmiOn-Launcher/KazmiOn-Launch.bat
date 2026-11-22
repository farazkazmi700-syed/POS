@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop/windows/KazmiOn-Start.ps1" %*
if errorlevel 1 (
  echo.
  echo KazmiOn could not start. Review KazmiOn-startup.log.
  pause
)
endlocal
