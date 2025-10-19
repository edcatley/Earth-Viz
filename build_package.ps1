Write-Host "Building earth-viz package..."

# Build frontend
Set-Location "frontend"
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
Get-ChildItem -Filter "*.tgz" | Remove-Item -Force
npm install
npm run build

# Copy frontend build to backend static directory
Set-Location ".."
$staticDir = "earth_viz_backend\src\earth_viz_backend\static"
if (Test-Path $staticDir) { Remove-Item -Recurse -Force $staticDir }
Copy-Item -Recurse "frontend\dist" $staticDir
Write-Host "Frontend copied to backend static directory"

# Auto-increment version in pyproject.toml
Set-Location "earth_viz_backend"
$pyprojectPath = "pyproject.toml"
$content = Get-Content $pyprojectPath -Raw
if ($content -match 'version = "(\d+)\.(\d+)\.(\d+)"') {
    $major = [int]$matches[1]
    $minor = [int]$matches[2]
    $patch = [int]$matches[3]
    $newPatch = $patch + 1
    $newVersion = "$major.$minor.$newPatch"
    $content = $content -replace 'version = "\d+\.\d+\.\d+"', "version = `"$newVersion`""
    Set-Content $pyprojectPath -Value $content -NoNewline
    Write-Host "Version bumped to $newVersion"
}

# Build backend package
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
Get-ChildItem -Filter "*.tar.gz" | Remove-Item -Force
pip install -e .
python -m build

Set-Location ".."
Write-Host "Package build complete!"
Get-ChildItem "frontend\*.tgz", "earth_viz_backend\dist\*.tar.gz" | Format-Table Name, Length
