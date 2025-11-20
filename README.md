# Earth Visualization

Interactive 3D globe visualization with real-time weather data from NOAA. Inspired by [Cameron Beccario's Earth](https://earth.nullschool.net/) but rebuilt from scratch with modern web technologies and extended with planet mode and programmatic control.

## Features

- **Interactive 3D Globe** - Multiple projections (orthographic, Waterman, Patterson, etc.)
- **Real-time Weather Data** - Wind, temperature, humidity, pressure from NOAA GFS
- **WebGL Particle Systems** - Smooth particle animations for wind and ocean currents
- **Multiple Modes** - Air, ocean, and planet visualization
- **Live Cloud Generation** - Real-time satellite imagery compositing
- **Programmatic Control** - WebSocket API for external control
- **Embeddable** - Use standalone or integrate into FastAPI applications

## Project Structure

- **`frontend/`** - TypeScript/D3/WebGL visualization application
- **`earth_viz_backend/`** - Python FastAPI backend for data proxying and control

## Quick Start

### Install from PyPI

```bash
pip install earth-viz
earth-viz-setup    # Download static files (~100MB, one-time)
earth-viz-server   # Start server
```

Access at `http://localhost:8000/earth-viz-app/`

### Development Mode

Run frontend and backend separately for development:

**Backend:**
```bash
cd earth_viz_backend
pip install earth-viz
earth-viz-setup
earth-viz-server
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Frontend dev server: `http://localhost:5173/`
Backend API: `http://localhost:8000/`

## Embedding in Your Application

Integrate earth-viz into your own FastAPI application:

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

The frontend is automatically served at `/earth-viz-app/` from the package's static files.

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

# Control the visualization
await set_projection("orthographic")
await set_air_mode("surface", "wind", "temp")
await set_planet_mode("mars")
```

## Data Storage

All earth-viz data is stored in `~/.earth_viz/`:

- **Static images**: `~/.earth_viz/static_images/` - Planet textures (downloaded via `earth-viz-setup`)
- **Generated clouds**: `~/.earth_viz/images/` - Real-time cloud imagery
- **Temp files**: `~/.earth_viz/tmp/` - Satellite image downloads

No manual configuration required.

## Building from Source

To build the distributable Python package:

1. **Build frontend:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Copy to backend:**
   ```bash
   cp -r frontend/dist earth_viz_backend/src/earth_viz_backend/static
   ```

3. **Build Python package:**
   ```bash
   cd earth_viz_backend
   python -m build
   ```

Output: `earth_viz_backend/dist/earth_viz-*.tar.gz`

## Weather Data

Weather data is fetched from [NOAA NOMADS](https://nomads.ncep.noaa.gov/) via OpenDAP:

- **Wind** - U/V components at multiple atmospheric levels
- **Temperature** - Air temperature
- **Humidity** - Relative humidity
- **Pressure** - Mean sea level pressure
- **Ocean currents** - Surface currents
- **Waves** - Wave height and direction

The backend proxies requests to avoid CORS issues.

## Live Cloud Generation

Real-time cloud imagery is generated every 30 minutes from [EUMETSAT](https://view.eumetsat.int/) satellite data:

- **Infrared** - IR108 channel
- **Visible** - Natural color RGB
- **Dust** - RGB dust composite

The cloud scheduler runs as a background task, compositing satellite imagery with Earth textures and day/night blending.

## Architecture

### Frontend

Built with TypeScript, D3.js, and WebGL:

- **D3.js** - Geographic projections and SVG rendering
- **WebGL** - Hardware-accelerated particle systems and overlays
- **Vite** - Build tooling and dev server

Key features:
- Modular system architecture (particles, mesh, overlay, planet)
- WebGL particle system with 10,000+ particles at 25fps
- WebSocket connection for programmatic control
- Responsive design with touch/mouse interaction

### Backend

Built with Python and FastAPI:

- **FastAPI** - Async web framework
- **httpx** - Async HTTP client for NOAA data
- **Pillow** - Image processing for cloud generation

Key features:
- OpenDAP and GRIB2 data proxying
- WebSocket API for external control
- Scheduled cloud generation (30-minute intervals)
- Serves bundled frontend as static files

### Control Flow

```
Python Application
    ↓
await set_projection("orthographic")
    ↓
WebSocket → /earth-viz/ws
    ↓
Browser Frontend
    ↓
EarthAPI.setProjection()
    ↓
Globe updates
```

## API Documentation

See individual READMEs for detailed documentation:

- [Backend API](earth_viz_backend/README.md) - FastAPI endpoints and WebSocket control
- [Frontend Architecture](frontend/README.md) - System design and data flow

## License

MIT

## Credits

Inspired by [Cameron Beccario's Earth](https://earth.nullschool.net/) and the [hint.fm wind map](http://hint.fm/wind/).
