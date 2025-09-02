Write-Host "Building earth-viz frontend..."

if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
Get-ChildItem -Filter "*.tgz" | Remove-Item -Force

npm install
npm run build:lib
npm pack

Write-Host "Build complete!"
Get-ChildItem -Filter "*.tgz" | Format-Table Name, Length
