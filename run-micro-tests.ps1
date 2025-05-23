# Build with the micro test config
Write-Host "Building with micro test config..." -ForegroundColor Green
npx vite build --config vite.micro-test.config.js

# Check if port 8081 is already in use
$portInUse = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue

if ($portInUse) {
    Write-Host "Port 8081 is already in use. Stopping the process..." -ForegroundColor Yellow
    $process = Get-Process -Id $portInUse.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -ne "Idle") {
        Stop-Process -Id $process.Id -Force
    }
}

# Start Vite dev server
Write-Host "Starting Vite dev server..." -ForegroundColor Green
npx vite --config vite.micro-test.config.js

# The server will stay running until you press Ctrl+C

# Wait a moment for the server to start
Start-Sleep -Seconds 2

# Open the test page in the default browser
Write-Host "Opening test page in browser..." -ForegroundColor Green
Start-Process "http://localhost:8081/micro-test.html"

Write-Host "`nTest server is running. Press Ctrl+C to stop." -ForegroundColor Cyan
Write-Host "To view tests again, open: http://localhost:8081/micro-test.html" -ForegroundColor Cyan 