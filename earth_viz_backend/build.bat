@echo off
echo Building PyPI package for earth_viz_backend...

:: Clean previous builds
if exist "dist" rmdir /s /q dist
if exist "build" rmdir /s /q build
if exist "src\earth_viz_backend.egg-info" rmdir /s /q "src\earth_viz_backend.egg-info"

:: Build the package
echo Installing/upgrading build tools...
pip install --upgrade build twine
timeout /t 2 /nobreak >nul

echo Building wheel and source distribution...
python -m build
timeout /t 3 /nobreak >nul

echo Build complete! Files created in dist/
dir dist

echo.
echo To publish to PyPI:
echo   twine upload dist/*
echo.
echo To install locally for testing:
echo   pip install -e .
