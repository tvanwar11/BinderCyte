@echo off
title PDB Builder
cd /d "%~dp0"

echo ============================================
echo    PDB Builder - target preparation
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
python -c "import flask, Bio, numpy" 2>nul
if errorlevel 1 (
    echo Installing flask, biopython and numpy...
    python -m pip install --quiet flask biopython numpy
)

echo.
echo Launching PDB Builder...
echo A browser window will open at http://127.0.0.1:5000
echo Keep this window open while working. Close it to stop the server.
echo.
python app.py

echo.
echo Server stopped.
pause
