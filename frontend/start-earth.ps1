# ANSI escape codes for colors
$Green = [char]27 + "[32m"
$Red = [char]27 + "[31m"
$Yellow = [char]27 + "[33m"
$Blue = [char]27 + "[34m"
$Reset = [char]27 + "[0m"

Write-Host "$Green=== Earth Visualization Startup Script ===$Reset`n"

# Check if Node.js is installed
try {
    $nodeVersion = node -v
    Write-Host "$Green[+] Node.js found: $nodeVersion$Reset"
} catch {
    Write-Host "$Red[X] Node.js not found! Please install Node.js from https://nodejs.org/$Reset"
    exit 1
}

# Check if Python is installed
$pythonAvailable = $false
try {
    $pythonVersion = python --version 2>&1
    Write-Host "$Green[+] Python found: $pythonVersion$Reset"
    $pythonAvailable = $true
} catch {
    Write-Host "$Yellow[!] Python not found. Weather API backend will not be available.$Reset"
    Write-Host "$Yellow[!] Install Python 3.8+ from https://python.org for full functionality.$Reset"
}

# Default port
$port = 8080

# Check if port parameter was provided
if ($args.Count -gt 0) {
    $port = $args[0]
}

# Ensure npm cache directory exists
$npmCachePath = Join-Path $PWD ".npm-cache"
New-Item -ItemType Directory -Force -Path $npmCachePath | Out-Null

# Clean install if node_modules is missing or if --clean flag is provided
if ((-not (Test-Path -Path "node_modules")) -or ($args -contains "--clean")) {
    Write-Host "`n$Yellow[>] Installing dependencies...$Reset"
    
    # Remove existing node_modules if it exists
    if (Test-Path -Path "node_modules") {
        Write-Host "$Yellow[>] Cleaning existing node_modules...$Reset"
        Remove-Item -Recurse -Force "node_modules"
    }
    
    # Clear npm cache
    Write-Host "$Yellow[>] Clearing npm cache...$Reset"
    npm cache clean --force
    
    # Install dependencies
    Write-Host "$Yellow[>] Installing project dependencies...$Reset"
    npm install --no-audit --no-fund --yes
    if ($LASTEXITCODE -ne 0) {
        Write-Host "$Red[X] Failed to install dependencies!$Reset"
        exit 1
    }
    Write-Host "$Green[+] Dependencies installed successfully!$Reset"
}

# Verify Vite is installed
if (-not (Test-Path -Path "node_modules/vite")) {
    Write-Host "$Yellow[>] Vite not found, installing...$Reset"
    npm install --no-audit --no-fund --yes vite
    if ($LASTEXITCODE -ne 0) {
        Write-Host "$Red[X] Failed to install Vite!$Reset"
        exit 1
    }
}

# Clear any existing processes on the port (if any)
$existingProcess = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
if ($existingProcess) {
    Write-Host "$Yellow[>] Port $port is in use. Attempting to free it...$Reset"
    Stop-Process -Id (Get-Process -Id $existingProcess.OwningProcess).Id -Force
}

# Check and start GRIB2 proxy server
$proxyPort = 3001
$existingProxyProcess = Get-NetTCPConnection -LocalPort $proxyPort -ErrorAction SilentlyContinue
if ($existingProxyProcess) {
    Write-Host "$Yellow[>] Proxy port $proxyPort is in use. Attempting to free it...$Reset"
    Stop-Process -Id (Get-Process -Id $existingProxyProcess.OwningProcess).Id -Force
    Start-Sleep -Seconds 2
}

Write-Host "`n$Green[>] Starting GRIB2 proxy server on port $proxyPort...$Reset"
# Start proxy server in a new visible PowerShell window
$proxyProcess = Start-Process -FilePath "powershell" -ArgumentList "-NoExit", "-Command", "Write-Host 'GRIB2 Proxy Server'; Write-Host 'Working Directory:' (Get-Location); node proxy-server.js" -PassThru

# Give proxy server time to start
Start-Sleep -Seconds 3

# Check if proxy started successfully
$proxyRunning = Get-NetTCPConnection -LocalPort $proxyPort -ErrorAction SilentlyContinue
if ($proxyRunning) {
    Write-Host "$Green[+] GRIB2 proxy server started successfully on port $proxyPort (PID: $($proxyProcess.Id))$Reset"
} else {
    Write-Host "$Red[X] Failed to start GRIB2 proxy server!$Reset"
    if ($proxyProcess -and !$proxyProcess.HasExited) {
        Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

# Start Python Weather API Backend if Python is available
$weatherApiJob = $null
$weatherApiPort = 8000
if ($pythonAvailable -and (Test-Path "server/main.py")) {
    # Clear existing process on weather API port
    $existingWeatherProcess = Get-NetTCPConnection -LocalPort $weatherApiPort -ErrorAction SilentlyContinue
    if ($existingWeatherProcess) {
        Write-Host "$Yellow[>] Weather API port $weatherApiPort is in use. Attempting to free it...$Reset"
        Stop-Process -Id (Get-Process -Id $existingWeatherProcess.OwningProcess).Id -Force
        Start-Sleep -Seconds 2
    }

    Write-Host "`n$Blue[>] Starting Python Weather API backend on port $weatherApiPort...$Reset"
    
    # Check if Python dependencies are installed
    $pipCheck = pip show fastapi 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "$Yellow[>] Installing Python dependencies...$Reset"
        Set-Location "server"
        pip install -r requirements.txt
        if ($LASTEXITCODE -ne 0) {
            Write-Host "$Red[X] Failed to install Python dependencies!$Reset"
            Set-Location ".."
        } else {
            Set-Location ".."
            Write-Host "$Green[+] Python dependencies installed successfully!$Reset"
        }
    }
    
    # Start the weather API backend
    if ($LASTEXITCODE -eq 0) {
        $weatherApiJob = Start-Job -ScriptBlock {
            param($workingDir)
            Set-Location (Join-Path $workingDir "server")
            uvicorn main:app --host 0.0.0.0 --port 8000
        } -ArgumentList $PWD

        # Give weather API time to start
        Start-Sleep -Seconds 5

        # Check if weather API started successfully
        $weatherApiRunning = Get-NetTCPConnection -LocalPort $weatherApiPort -ErrorAction SilentlyContinue
        if ($weatherApiRunning) {
            Write-Host "$Green[+] Weather API backend started successfully on port $weatherApiPort$Reset"
            Write-Host "$Blue[+] API Documentation: http://localhost:$weatherApiPort/docs$Reset"
        } else {
            Write-Host "$Yellow[!] Weather API backend failed to start (this is optional)$Reset"
            if ($weatherApiJob) {
                Receive-Job $weatherApiJob
                Remove-Job $weatherApiJob -Force
                $weatherApiJob = $null
            }
        }
    }
} elseif (-not $pythonAvailable) {
    Write-Host "`n$Yellow[!] Skipping Weather API backend (Python not available)$Reset"
} else {
    Write-Host "`n$Yellow[!] Skipping Weather API backend (server/main.py not found)$Reset"
}

Write-Host "`n$Green[>] Starting Earth Visualization on port $port...$Reset"
Write-Host "$Yellow[>] Access the application at: http://localhost:$port$Reset"
Write-Host "$Yellow[>] GRIB2 proxy running at: http://localhost:$proxyPort$Reset"
if ($weatherApiJob) {
    Write-Host "$Blue[>] Weather API running at: http://localhost:$weatherApiPort$Reset"
    Write-Host "$Blue[>] API docs available at: http://localhost:$weatherApiPort/docs$Reset"
}
Write-Host "$Yellow[>] Press Ctrl+C to stop all servers$Reset`n"

# Function to cleanup background jobs on exit
function Cleanup {
    Write-Host "`n$Yellow[>] Stopping servers...$Reset"
    if ($proxyProcess -and !$proxyProcess.HasExited) {
        Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "$Green[+] GRIB2 proxy server stopped$Reset"
    }
    if ($weatherApiJob) {
        Stop-Job $weatherApiJob -ErrorAction SilentlyContinue
        Remove-Job $weatherApiJob -Force -ErrorAction SilentlyContinue
        Write-Host "$Green[+] Weather API backend stopped$Reset"
    }
}

# Register cleanup function for Ctrl+C
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Cleanup }
$null = Register-ObjectEvent -InputObject ([Console]) -EventName CancelKeyPress -Action { Cleanup; exit }

# Start the development server using Vite through npx
$env:VITE_PORT = $port
$viteCmd = Join-Path $PWD "node_modules/.bin/vite"
try {
    & $viteCmd 
} finally {
    # Cleanup when Vite exits
    Cleanup
} 