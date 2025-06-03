# Earth Weather API Server Startup Script
Write-Host "=== Starting Earth Weather API Server ===" -ForegroundColor Cyan

# Kill any existing Python processes on port 8000
Write-Host "Killing existing servers..." -ForegroundColor Yellow
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start the server
Write-Host "Starting server on http://localhost:8000" -ForegroundColor Green
python main.py 