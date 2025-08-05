# Weather Data API Backend

A FastAPI-based backend service for fetching and converting GRIB2 weather data from NOAA NOMADS.

## Features

- Fetch latest GFS weather data from NOAA NOMADS
- Convert GRIB2 binary data to JSON format
- Support for multiple weather parameters (wind, temperature, humidity, etc.)
- Automatic detection of latest available data runs
- CORS enabled for frontend integration

## Quick Start (Windows)

### Automatic Setup
Run the setup script to automatically install all dependencies:
```cmd
setup.bat
```

This will:
- Check Python installation
- Create virtual environment (optional)
- Install all Python dependencies
- Attempt multiple methods to install pygrib
- Verify installation

### Start the Server
```cmd
start.bat
```

The API will be available at `http://localhost:8000`

## Manual Installation

### Prerequisites
- Python 3.8+ installed and in PATH
- pip package manager

### 1. Create Virtual Environment (Recommended)
```cmd
python -m venv venv
venv\Scripts\activate
```

### 2. Install Dependencies
```cmd
pip install -r requirements.txt
```

### 3. Install pygrib (GRIB2 Support)
`pygrib` requires GRIB API libraries. Try these methods in order:

**Method 1 - Conda (Recommended for Windows):**
```cmd
conda install -c conda-forge eccodes pygrib
```

**Method 2 - Pre-built wheels:**
```cmd
pip install --find-links https://github.com/jswhit/pygrib/releases pygrib
```

**Method 3 - Manual eccodes installation:**
1. Download eccodes from: https://confluence.ecmwf.int/display/ECC/Releases
2. Extract and set `ECCODES_DIR` environment variable
3. Run: `pip install pygrib`

**Method 4 - WSL (Windows Subsystem for Linux):**
```bash
sudo apt-get install libeccodes-dev
pip install pygrib
```

### 4. Start the Server
```cmd
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Linux/macOS Installation

### Ubuntu/Debian:
```bash
sudo apt-get install libeccodes-dev
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### macOS with Homebrew:
```bash
brew install eccodes
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Start Server:
```bash
python main.py
```

## API Endpoints

### Health Check
```
GET /health
```

### Weather Data
```
GET /api/v1/data/weather/{parameter}?level={level}&date={date}&cycle={cycle}&forecast={forecast}
```

Parameters:
- `parameter`: GRIB2 parameter code (UGRD, VGRD, TMP, RH, etc.)
- `level`: Atmospheric level (10_m_above_ground, 2_m_above_ground, etc.)
- `date`: Date in YYYYMMDD format (optional, defaults to latest)
- `cycle`: Model cycle hour (00, 06, 12, 18) (optional, defaults to latest)
- `forecast`: Forecast hour (000, 003, 006, etc.) (default: 000)

### Metadata
```
GET /api/v1/parameters  # Available weather parameters
GET /api/v1/levels      # Available atmospheric levels
```

## Example Usage

```bash
# Get latest wind U-component at 10m above ground
curl "http://localhost:8000/api/v1/data/weather/UGRD?level=10_m_above_ground"

# Get temperature at 2m above ground for specific date/time
curl "http://localhost:8000/api/v1/data/weather/TMP?level=2_m_above_ground&date=20241201&cycle=12"

# Get available parameters
curl "http://localhost:8000/api/v1/parameters"
```

## Response Format

```json
{
  "source": "GFS/NCEP",
  "parameter": "UGRD",
  "level": "10_m_above_ground",
  "reference_time": "2024-12-01T12:00:00",
  "forecast_time": 0,
  "grid": {
    "nx": 1440,
    "ny": 721,
    "lon0": 0.0,
    "lat0": 90.0,
    "dlon": 0.25,
    "dlat": 0.25
  },
  "values": [1.2, 1.5, 1.8, ...],
  "units": "m/s"
}
```

## Development

The API documentation is automatically generated and available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Next Steps

This is a minimal implementation that can be extended with:
- Caching layer (Redis)
- Database for metadata storage
- Rate limiting
- Authentication
- Multiple data sources
- Batch processing
- WebSocket support for real-time updates