@echo off
echo Starting Earth Visualization Frontend...
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    echo.
)

REM Start the Vite development server
echo Starting Vite dev server on http://localhost:5173
npm run dev

pause
