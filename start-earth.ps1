# ANSI escape codes for colors
$Green = [char]27 + "[32m"
$Red = [char]27 + "[31m"
$Yellow = [char]27 + "[33m"
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

Write-Host "`n$Green[>] Starting Earth Visualization on port $port...$Reset"
Write-Host "$Yellow[>] Access the application at: http://localhost:$port$Reset"
Write-Host "$Yellow[>] Press Ctrl+C to stop the server$Reset`n"

# Start the development server using Vite through npx
$env:VITE_PORT = $port
$viteCmd = Join-Path $PWD "node_modules/.bin/vite"
& $viteCmd 