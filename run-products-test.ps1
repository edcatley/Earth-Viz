# Build with the products test config
Write-Host "Building with products test config..." -ForegroundColor Green
npx vite build --config vite.products-test.config.js

# Check if port 8082 is already in use
$portInUse = Get-NetTCPConnection -LocalPort 8082 -ErrorAction SilentlyContinue

if ($portInUse) {
    Write-Host "Port 8082 is already in use. Stopping the process..." -ForegroundColor Yellow
    $process = Get-Process -Id $portInUse.OwningProcess -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -ne "Idle") {
        Stop-Process -Id $process.Id -Force
    }
}

# Start Vite dev server in a new PowerShell window
Write-Host "Starting Vite dev server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx vite --config vite.products-test.config.js"

# Wait a moment for the server to start
Start-Sleep -Seconds 2

# Open the test page in the default browser
Write-Host "Opening test page in browser..." -ForegroundColor Green
Start-Process "http://localhost:8082/products-test.html"

Write-Host "`nTest server is running. Press Ctrl+C to stop." -ForegroundColor Cyan
Write-Host "To view tests again, open: http://localhost:8082/products-test.html" -ForegroundColor Cyan 