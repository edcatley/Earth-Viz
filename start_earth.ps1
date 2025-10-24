Write-Host "Starting Earth Visualization System..."

Set-Location "earth_viz_backend"

# Create venv if it doesn't exist
if (-not (Test-Path "venv")) { 
    Write-Host "Creating virtual environment..."
    python -m venv venv 
}

# Activate venv
.\venv\Scripts\Activate.ps1

# Install package in editable mode (includes all dependencies from pyproject.toml)
Write-Host "Installing dependencies..."
pip install -e .

# Start backend server using console script
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\venv\Scripts\Activate.ps1; earth-viz-server"

Start-Sleep 3

Set-Location "..\frontend"
if (-not (Test-Path "node_modules")) { npm install }
npm run dev
