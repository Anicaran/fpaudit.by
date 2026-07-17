@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ========================================
echo   FP Audit Mobile Web (HTTPS)
echo ========================================
echo.

set "VENV=%cd%\server\.venv"
set "PY=%VENV%\Scripts\python.exe"
set "CERT_DIR=%cd%\certs"
set "KEY=%CERT_DIR%\key.pem"
set "CERT=%CERT_DIR%\cert.pem"
set "PORT=8443"

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

if not exist "%KEY%" (
    echo Generating self-signed certificate...
    if not exist "%CERT_DIR%" mkdir "%CERT_DIR%"
    where openssl >nul 2>&1
    if not errorlevel 1 (
        openssl req -x509 -newkey rsa:2048 -keyout "%KEY%" -out "%CERT%" -days 825 -nodes -subj "/CN=fpa-mobile-web"
    )
    if not exist "%KEY%" (
        "%PY%" -m pip install -q cryptography
        "%PY%" "%cd%\server\gen_cert.py"
    )
    if not exist "%KEY%" (
        echo ERROR: certificate generation failed
        goto finish
    )
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
echo Starting HTTPS server...
echo   On this PC:  https://127.0.0.1:%PORT%
echo   On phone:    https://YOUR_PC_IP:%PORT%
echo   Accept the certificate warning once — required for camera.
echo.

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo Stopping old process on port %PORT% PID %%p...
    taskkill /F /PID %%p >nul 2>&1
)

echo Press Ctrl+C to stop.
echo.

cd /d "%cd%\server"
"%PY%" -m uvicorn main:app --host 0.0.0.0 --port %PORT% --ssl-keyfile="%KEY%" --ssl-certfile="%CERT%"

:finish
echo.
pause
endlocal
