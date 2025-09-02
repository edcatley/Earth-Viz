Write-Host "Building earth-viz package..."

Set-Location "frontend"
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
Get-ChildItem -Filter "*.tgz" | Remove-Item -Force
npm install
npm run build:lib
npm pack

Set-Location "..\earth_viz_backend"
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
Get-ChildItem -Filter "*.tar.gz" | Remove-Item -Force
pip install -e .
python -m build

Set-Location ".."
Write-Host "Package build complete!"
Get-ChildItem "frontend\*.tgz", "earth_viz_backend\dist\*.tar.gz" | Format-Table Name, Length
