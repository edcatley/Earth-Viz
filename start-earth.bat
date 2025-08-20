@echo off
REM Earth Visualization - Simple Startup Script

echo Starting Earth Visualization System...

REM Start backend in a new window
echo Starting backend API server...
start "Earth Backend API" cmd /c "cd backend && start.bat"

REM Wait a moment for backend to start
timeout /t 3 /nobreak >nul

REM Change to frontend directory and start dev server
echo Starting frontend development server...
cd frontend

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing frontend dependencies...
    npm install
    if errorlevel 1 (
        echo Failed to install frontend dependencies!
        pause
        exit /b 1
    )
    echo Frontend dependencies installed
)

echo.
echo Frontend will be available at: http://localhost:8080
echo Backend API available at: http://localhost:8000
echo.
echo Press Ctrl+C to stop the frontend server
echo Close the backend window to stop the API
echo.

REM Start the frontend
npm run dev

echo.
echo Frontend server stopped.
echo Backend API may still be running in separate window.
pause