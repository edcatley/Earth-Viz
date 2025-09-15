Write-Host "Building earth-viz package..."

# Build frontend
Set-Location "frontend"
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
Get-ChildItem -Filter "*.tgz" | Remove-Item -Force
npm install
npm run build
npm run build:lib
npm pack

# Copy frontend build to backend static directory
Set-Location ".."
$staticDir = "earth_viz_backend\src\earth_viz_backend\static"
if (Test-Path $staticDir) { Remove-Item -Recurse -Force $staticDir }
Copy-Item -Recurse "frontend\dist" $staticDir
Write-Host "Frontend copied to backend static directory"

# Build backend package
Set-Location "earth_viz_backend"
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
Get-ChildItem -Filter "*.tar.gz" | Remove-Item -Force
pip install -e .
python -m build

Set-Location ".."
Write-Host "Package build complete!"
Get-ChildItem "frontend\*.tgz", "earth_viz_backend\dist\*.tar.gz" | Format-Table Name, Length
