# Earth-Viz Backend

FastAPI backend server for the Earth-Viz interactive globe visualization.

## What It Does

- Serves the Earth-Viz web application
- Proxies NOAA weather data requests (OpenDAP and GRIB2)
- Generates real-time cloud imagery from satellite data
- Provides WebSocket API for programmatic control of the visualization
- Serves static planet textures

## Quick Start

```bash
pip install earth-viz
earth-viz-setup    # Download static files (one-time, ~300MB)
earth-viz-server   # Start server
```

The application will be available at `http://localhost:8000/earth-viz-app/`

## Installation

### Prerequisites
- Python 3.8+
- pip package manager

### Install Package
```bash
pip install earth-viz
```

### Download Static Files
The package requires high-resolution planet textures (~300MB). Download them once:

```bash
earth-viz-setup
```

This downloads static images to `~/.earth_viz/static_images/`

### Start Server
```bash
earth-viz-server
```

## API Endpoints

### Web Application
```
GET /earth-viz-app/          # Main application
```

### Health & Status
```
GET /earth-viz/api/health    # Health check
GET /earth-viz/api/status    # Connection status
```

### Data Proxies
```
GET /earth-viz/api/proxy/opendap?url={url}           # OpenDAP data proxy
GET /earth-viz/api/cgi-bin/filter_gfs_0p25.pl        # GRIB2 data proxy
```

### Planet Images
```
GET /earth-viz/api/planets/{planet_name}             # Static planet textures
```

Supported planets: `earth`, `mars`, `venus`, `moon`, `jupiter`, `saturn`, `uranus`, `neptune`, `mercury`

### Cloud Generation
```
GET /earth-viz/api/live-earth/status                 # Trigger cloud generation
```

### WebSocket Control
```
WS /earth-viz/ws                                     # Control connection
```

## WebSocket Control API

Connect to `/earth-viz/ws` to send commands to the visualization:

```javascript
const ws = new WebSocket('ws://localhost:8000/earth-viz/ws');

ws.send(JSON.stringify({
  type: 'EARTH_COMMAND',
  command: 'setProjection',
  params: ['orthographic']
}));
```

Available commands:
- `setProjection(projection)` - Set map projection
- `setOverlay(type)` - Set overlay type
- `setAirMode(level, particleType, overlayType)` - Air mode
- `setOceanMode(particleType, overlayType)` - Ocean mode
- `setPlanetMode(planet)` - Planet mode
- `setLevel(level)` - Set atmospheric level
- `showGrid()` / `hideGrid()` - Toggle grid
- `setWindUnits(units)` - Set wind units
- `setDate(date)` / `setHour(hour)` - Time controls
- `navigateTime(hours)` - Navigate time
- `goToNow()` - Reset to current time
- `hideUI()` / `showUI()` - Toggle UI
- `enableFullScreen()` / `disableFullScreen()` - Fullscreen

## Integration Mode

Mount the Earth-Viz router in your own FastAPI application:

```python
from fastapi import FastAPI
from earth_viz_backend.earth_viz_api import create_earth_viz_router
from earth_viz_backend.earth_control import create_earth_control_router
from earth_viz_backend.services.cloud_scheduler import scheduler
import asyncio

app = FastAPI()

# Mount routers
app.include_router(create_earth_viz_router())
app.include_router(create_earth_control_router())

# Add lifecycle handlers
@app.on_event("startup")
async def startup():
    asyncio.create_task(scheduler.start())

@app.on_event("shutdown")
async def shutdown():
    await scheduler.stop()
```

### Programmatic Control

Control the visualization from Python:

```python
from earth_viz_backend.earth_control import (
    set_projection,
    set_air_mode,
    set_planet_mode,
    await_earth_connection
)

# Wait for frontend to connect
await await_earth_connection(timeout=30.0)

# Send commands
await set_projection("orthographic")
await set_air_mode("surface", "wind", "temp")
await set_planet_mode("mars")
```

## Development

API documentation available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## File Locations

- Static images: `~/.earth_viz/static_images/`
- Generated clouds: `~/.earth_viz/images/`
- Package source: `src/earth_viz_backend/`
- Frontend app: `src/earth_viz_backend/static/`