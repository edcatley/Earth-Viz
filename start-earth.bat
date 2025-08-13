@echo off
REM Earth Visualization - Unified Startup Script
REM Starts both backend API server and frontend development server

setlocal enabledelayedexpansion

echo.
echo ========================================
echo   Earth Visualization System
echo ========================================
echo.

REM Color codes for Windows (limited support)
set "GREEN=[92m"
set "RED=[91m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "RESET=[0m"

REM Check if Node.js is installed
echo Checking Node.js...
node -v >nul 2>&1
if errorlevel 1 (
    echo %RED%[X] Node.js not found! Please install Node.js from https://nodejs.org/%RESET%
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
    echo %GREEN%[+] Node.js found: !NODE_VERSION!%RESET%
)

REM Check if Python is installed
echo Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo %YELLOW%[!] Python not found. Backend API will not be available.%RESET%
    echo %YELLOW%[!] Install Python 3.8+ from https://python.org for full functionality.%RESET%
    set PYTHON_AVAILABLE=false
) else (
    for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
    echo %GREEN%[+] Python found: !PYTHON_VERSION!%RESET%
    set PYTHON_AVAILABLE=true
)

echo.
echo ========================================
echo   Starting Backend API Server
echo ========================================
echo.

if "%PYTHON_AVAILABLE%"=="true" (
    REM Start backend in a new window
    echo %BLUE%[>] Starting backend API server...%RESET%
    start "Earth Backend API" cmd /c "cd backend && start.bat"
    
    REM Wait a moment for backend to start
    echo Waiting for backend to initialize...
    timeout /t 5 /nobreak >nul
    
    echo %GREEN%[+] Backend API server started in separate window%RESET%
    echo %BLUE%[>] API available at: http://localhost:8000%RESET%
    echo %BLUE%[>] API docs at: http://localhost:8000/docs%RESET%
) else (
    echo %YELLOW%[!] Skipping backend - Python not available%RESET%
)

echo.
echo ========================================
echo   Starting Frontend Development Server
echo ========================================
echo.

REM Change to frontend directory
cd frontend

REM Check if node_modules exists
if not exist "node_modules" (
    echo %YELLOW%[>] Installing frontend dependencies...%RESET%
    npm install
    if errorlevel 1 (
        echo %RED%[X] Failed to install frontend dependencies!%RESET%
        pause
        exit /b 1
    )
    echo %GREEN%[+] Frontend dependencies installed%RESET%
)

REM Start frontend development server
echo %BLUE%[>] Starting frontend development server...%RESET%
echo.
echo %GREEN%Frontend will be available at: http://localhost:8080%RESET%
if "%PYTHON_AVAILABLE%"=="true" (
    echo %GREEN%Backend API available at: http://localhost:8000%RESET%
)
echo.
echo %YELLOW%Press Ctrl+C to stop the frontend server%RESET%
echo %YELLOW%Close the backend window separately to stop the API%RESET%
echo.

REM Start the frontend (this will block until stopped)
npm run dev

REM If we get here, frontend was stopped
echo.
echo %YELLOW%Frontend server stopped.%RESET%
echo %YELLOW%Backend API may still be running in separate window.%RESET%
pause