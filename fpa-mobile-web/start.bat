@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   FP Audit Mobile Web
echo ========================================
echo.

set "VENV=%cd%\server\.venv"
set "PY=%VENV%\Scripts\python.exe"

if not exist "%PY%" (
    echo Creating virtual environment...
    where py >nul 2>&1 && (
        py -3 -m venv "%VENV%"
    ) || (
        python -m venv "%VENV%"
    )
    if errorlevel 1 (
        echo ERROR: could not create venv. Install Python 3.10+
        goto finish
    )
)

if not exist "%PY%" (
    echo ERROR: Python venv missing at %PY%
    goto finish
)

echo Installing Python dependencies...
"%PY%" -m pip install -q -r "%cd%\server\requirements.txt"
if errorlevel 1 (
    echo ERROR: pip install failed
    goto finish
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm not found. Install Node.js 18+ for React build.
    goto finish
)

echo.
echo Building React client...
cd /d "%cd%\client"
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    cd /d "%~dp0"
    goto finish
)
call npm run build
if errorlevel 1 (
    echo ERROR: npm run build failed
    cd /d "%~dp0"
    goto finish
)
cd /d "%~dp0"

echo.
echo Starting server (HTTP)...
echo   On this PC:  http://127.0.0.1:8080
echo   On phone:    http://YOUR_PC_IP:8080
echo.
echo NOTE: Live camera needs HTTPS. For scanning price tags use start-https.bat
echo.

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
    echo Stopping old process on port 8080 PID %%p...
    taskkill /F /PID %%p >nul 2>&1
)

echo Press Ctrl+C to stop.
echo.

cd /d "%cd%\server"
"%PY%" -m uvicorn main:app --host 0.0.0.0 --port 8080

:finish
echo.
pause
endlocal
