Write-Host "Starting Earth Visualization System..."

Set-Location "earth_viz_backend"
if (Test-Path "requirements.txt") {
    if (-not (Test-Path "venv")) { python -m venv venv }
    .\venv\Scripts\Activate.ps1
    pip install -r requirements.txt
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", "python standalone_server.py"

Start-Sleep 3

Set-Location "..\frontend"
if (-not (Test-Path "node_modules")) { npm install }
npm run dev
