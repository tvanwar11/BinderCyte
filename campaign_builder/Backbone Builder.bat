@echo off
title Backbone Builder
cd /d "%~dp0"

echo ============================================
echo    Backbone Builder - RFdiffusion pipeline
echo ============================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python was not found on your PATH.
    echo Install Python or add it to PATH, then run this again.
    echo.
    pause
    exit /b 1
)

echo Checking dependencies...
python -c "import flask, paramiko" 2>nul
if errorlevel 1 (
    echo Installing flask and paramiko...
    python -m pip install --quiet flask paramiko
)

echo.
echo Launching Backbone Builder...
echo A browser window will open at http://127.0.0.1:5001
echo Keep this window open while working. Close it to stop the server.
echo.
python app.py

echo.
echo Server stopped.
pause
