
@echo off
title KazmiOn POS Launcher
color 0B

cd /d "%~dp0"

echo ========================================
echo          KazmiOn POS System
echo ========================================
echo.
echo Checking Docker and starting services...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop/windows/KazmiOn-Start.ps1"

if errorlevel 1 (
    echo.
    echo KazmiOn failed to start.
    echo Check the error above.
    pause
    exit /b 1
)

echo.
echo KazmiOn launched successfully.
timeout /t 3 /nobreak >nul
exit /b 0
