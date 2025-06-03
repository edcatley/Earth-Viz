# Earth Weather API Backend

A lightweight Python backend for downloading and serving GRIB2 weather data from NOAA NOMADS.

## Features

- Downloads GRIB2 files from NOAA GFS 0.25° resolution data
- Parses weather data using cfgrib/xarray 
- Serves clean JSON API endpoints
- Built-in caching to avoid re-downloading files
- CORS enabled for frontend integration
- Auto-generated API documentation

## Setup

1. **Install Python 3.8+** (required)

2. **Install dependencies:**
   ```bash
   cd server
   pip install -r requirements.txt
   ```
   
   Or run the setup script:
   ```bash
   python setup.py
   ```

3. **Start the server:**
   ```bash
   python main.py
   ```
   
   Or for development with auto-reload:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

## API Endpoints

### Health Check
```
GET /
```
Returns API status.

### Get Weather Data
```
GET /weather/data?param={parameter}&date={YYYYMMDD}&hour={0,6,12,18}&level={surface,850,500}
```

**Parameters:**
- `param` (required): Weather parameter
  - `wind_u` - U-component of wind
  - `wind_v` - V-component of wind  
  - `temp` - Temperature
  - `relative_humidity` - Relative humidity
  - `pressure` - Sea level pressure
- `date` (optional): Date in YYYYMMDD format, defaults to today
- `hour` (optional): Hour (0, 6, 12, 18), defaults to latest available
- `level` (optional): Pressure level, defaults to "surface"

**Example:**
```
GET /weather/data?param=wind_u&date=20241225&hour=12&level=surface
```

### Get Wind Data (Both Components)
```
GET /weather/wind?date={YYYYMMDD}&hour={0,6,12,18}&level={surface,850,500}
```

Returns both U and V wind components in a single response.

## Response Format

```json
{
  "parameter": "wind_u",
  "data": [[...], [...], ...],  // 2D array of values
  "grid": {
    "latitudes": [...],
    "longitudes": [...],
    "ni": 1440,           // Number of longitude points
    "nj": 721,            // Number of latitude points  
    "dx": 0.25,           // Longitude resolution
    "dy": 0.25,           // Latitude resolution
    "lo1": -180.0,        // First longitude
    "la1": 90.0,          // First latitude
    "lo2": 179.75,        // Last longitude
    "la2": -90.0          // Last latitude
  },
  "metadata": {
    "source": "NOAA GFS",
    "resolution": "0.25 degree",
    "units": "m s**-1"
  }
}
```

## Data Sources

- **NOAA GFS 0.25°**: Global weather model data updated every 6 hours
- **NOMADS**: NOAA's Operational Model Archive and Distribution System
- **Resolution**: 0.25° (~25km) global grid
- **Update Schedule**: 00:00, 06:00, 12:00, 18:00 UTC daily

## Caching

The server caches up to 10 downloaded GRIB2 files to improve performance. Cache is cleared when the limit is reached (LRU eviction).

## API Documentation

Once the server is running, visit http://localhost:8000/docs for interactive API documentation powered by FastAPI.

## Integration with Frontend

The frontend can now make simple HTTP requests instead of dealing with GRIB2 files:

```javascript
// Get wind data
const response = await fetch('http://localhost:8000/weather/wind?hour=12');
const windData = await response.json();

// Get temperature data  
const tempResponse = await fetch('http://localhost:8000/weather/data?param=temp');
const tempData = await tempResponse.json();
```

## Dependencies

- **FastAPI**: Modern web framework for building APIs
- **cfgrib**: GRIB file reading library
- **xarray**: N-dimensional labeled data structures  
- **requests**: HTTP library for downloading files
- **uvicorn**: ASGI server for running FastAPI

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (invalid parameters)
- `500`: Server error (download/parsing failures)

Errors include descriptive messages to help with debugging.