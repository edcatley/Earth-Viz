# Earth-Viz Backend

A FastAPI-based backend service for the Earth-Viz weather visualization package.

## Architecture

This backend is designed for dual usage:
1. **Standalone development server** - For developing and testing earth-viz independently
2. **Importable router** - For integration into larger applications as an NPM package

## Features

- Fetch latest GFS weather data from NOAA NOMADS
- Convert GRIB2 binary data to JSON format
- Support for multiple weather parameters (wind, temperature, humidity, etc.)
- Real-time cloud generation and earth imagery
- CORS enabled for frontend integration
- Modular design for easy integration

## Development Mode

### Quick Start
```cmd
python standalone_server.py
```

The development server will be available at `http://localhost:8000`

### Manual Setup
```cmd
# Install dependencies
pip install -r requirements.txt

# Start development server
python standalone_server.py
```

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
python standalone_server.py
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
python standalone_server.py
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

## Integration Mode

For integration into larger applications:

```python
# In your main FastAPI app
from earth_viz_api import create_earth_viz_router, startup_earth_viz, shutdown_earth_viz

app = FastAPI()

# Mount earth-viz router
earth_router = create_earth_viz_router()
app.include_router(earth_router, prefix="/api/earth-viz")

# Add lifecycle events
@app.on_event("startup")
async def startup():
    await startup_earth_viz()

@app.on_event("shutdown")
async def shutdown():
    await shutdown_earth_viz()
```

## NPM Package Structure

When packaged as NPM:
- `standalone_server.py` is excluded via `.npmignore`
- `src/earth_viz_api.py` provides the importable router
- All services and dependencies are included
- Parent application manages Python dependencies