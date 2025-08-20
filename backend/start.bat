@echo off
REM Weather Data API Startup Script
REM Starts the FastAPI backend server using virtual environment

echo.
echo ========================================
echo   Weather Data API Server
echo ========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

REM Check if virtual environment exists, create if not
if not exist "venv\Scripts\activate.bat" (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo ERROR: Failed to create virtual environment
        pause
        exit /b 1
    )
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Using virtual environment: %VIRTUAL_ENV%

echo.
echo Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    echo Try: pip install --upgrade pip
    pause
    exit /b 1
)

echo.
echo Checking installations...
python -c "import fastapi, httpx, uvicorn, pydantic, numpy; print('✓ Core dependencies available')" 2>nul
if errorlevel 1 (
    echo ERROR: Core dependencies missing after installation
    pause
    exit /b 1
)



REM Start the server
echo Starting Weather Data API server...
echo.
echo API will be available at: http://localhost:8000
echo API documentation at: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

REM Run the FastAPI server using new standalone server
python standalone_server.py

REM If we get here, the server stopped
echo.
echo Server stopped.
pause