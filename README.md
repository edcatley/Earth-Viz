# Earth Visualization

A modern, interactive 3D visualization of global weather conditions with real-time data from NOAA GFS. Started as a fork of [Cameron Beccario's Earth](https://earth.nullschool.net/) but became almost a complete rewrite. Full credit to him for the original idea and implementation.
Extended to include a planet mode and a backend to allow easier integration and embedding into other applications.

## Features

- **Interactive 3D Globe** - Orthographic, stereographic, and other projections
- **Real-time Weather Data** - Wind, temperature, humidity, pressure from NOAA
- **Particle Animation** - Fluid particle systems for wind and ocean currents
- **Multiple Modes** - Air, ocean, and planet visualization modes
- **Live Cloud Maps** - Real-time satellite imagery from EUMETSAT
- **Embeddable** - Use as standalone app or embed in your own FastAPI application

## Project Structure

This repository contains two main components:

- **`frontend/`** - TypeScript/React visualization application
- **`earth_viz_backend/`** - Python FastAPI backend for weather data and APIs

## Quick Start

### Option 1: Standalone Mode

Run the complete application with both frontend and backend:

```bash
# Install backend
cd earth_viz_backend
pip install -e .

# Download static planet textures (~300MB, one-time setup)
earth-viz-setup

# Run standalone server
python standalone_server.py
```

Access at `http://localhost:8000/`

### Option 2: Development Mode

Run frontend and backend separately for development:

**Backend:**
```bash
cd earth_viz_backend
pip install -e .
earth-viz-setup
python standalone_server.py
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

Use earth-viz as a component in your own FastAPI application:

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from earth_viz_backend import create_earth_viz_router, create_earth_control_router
from pathlib import Path
import earth_viz_backend

app = FastAPI()

# Mount earth-viz routers
app.include_router(create_earth_viz_router())
app.include_router(create_earth_control_router())

# Mount static frontend (after running build_package.ps1)
package_dir = Path(earth_viz_backend.__file__).parent
static_dir = package_dir / "static"
app.mount("/earth-viz-app", StaticFiles(directory=static_dir, html=True))
```

### Programmatic Control

Control the visualization from your Python code:

```python
from earth_viz_backend import (
    set_projection,
    set_air_mode,
    set_overlay,
    await_earth_connection
)

# Wait for frontend to connect
await await_earth_connection(timeout=30.0)

# Control the visualization
await set_projection("orthographic")
await set_air_mode(level="500hPa", particle_type="wind", overlay_type="temp")
await set_overlay("wind")
```

## Configuration

**No manual configuration required!** All earth-viz data is stored in `~/.earth_viz/`:

- **Static images**: `~/.earth_viz/static_images/` (downloaded via `earth-viz-setup`)
- **Generated cloud maps**: `~/.earth_viz/images/` (persists across reboots)
- **Temp files**: `~/.earth_viz/tmp/` (satellite image downloads)

Everything is automatically created and managed. No config files needed!

## Building for Production

Build both frontend and backend into a single distributable package:

```bash
# From repository root
.\build_package.ps1
```

This will:
1. Build the frontend (TypeScript → JavaScript bundle)
2. Copy frontend build to backend static directory
3. Auto-increment backend version
4. Build Python wheel package

Output:
- `frontend/*.tgz` - NPM package
- `earth_viz_backend/dist/*.tar.gz` - Python package

## Weather Data

Weather data is fetched automatically from [NOAA NOMADS](https://nomads.ncep.noaa.gov/) GFS (Global Forecast System):

- **Wind vectors** - U/V components at multiple pressure levels
- **Temperature** - Air temperature at pressure levels
- **Humidity** - Relative humidity
- **Pressure** - Mean sea level pressure
- **Precipitation** - Total precipitable water

Data is proxied through the FastAPI backend to avoid CORS issues and is cached for performance.

## Live Cloud Maps

Real-time satellite imagery is generated every 30 minutes from [EUMETSAT](https://view.eumetsat.int/):

- **Infrared** - IR108 channel for cloud detection
- **Visible** - Natural color RGB composite
- **Dust** - RGB dust composite

The cloud generator runs as a background task and composites satellite imagery with monthly Earth textures and day/night blending based on solar position.

## Architecture

### Frontend (TypeScript/React)

- **D3.js** - Geographic projections and map rendering
- **Three.js** - 3D globe rendering with WebGL
- **React** - UI components and state management
- **Vite** - Build tooling and dev server

Key features:
- Bilinear interpolation for smooth wind field rendering
- Particle system with 10,000+ animated particles
- WebSocket connection to backend for programmatic control
- Configurable via URL hash parameters

### Backend (Python/FastAPI)

- **FastAPI** - Async web framework
- **httpx** - Async HTTP client for NOAA data
- **Pillow** - Image processing for cloud maps
- **NumPy** - Numerical operations for satellite imagery

Key features:
- GRIB2 data proxy with caching
- WebSocket bridge for external control
- Scheduled cloud map generation (30-minute intervals)
- Dual-mode operation (standalone/embedded)

### Control Flow

```
External App (Python)
    ↓
await set_projection("orthographic")
    ↓
WebSocket message
    ↓
Browser (Static Frontend)
    ↓
window.EarthAPI.setProjection()
    ↓
Visualization updates
```

## API Reference

See `frontend/src/core/EarthAPI.ts` for the complete frontend API.

Key methods:
- `setAirMode(level, particleType, overlayType)` - Configure air visualization
- `setOceanMode(particleType, overlayType)` - Configure ocean visualization
- `setPlanetMode(planetType)` - Display planet surfaces
- `setProjection(projection)` - Change map projection
- `setOverlay(overlayType)` - Set weather overlay
- `setConfig(config)` - Bulk configuration update

## License

MIT

## Credits

Inspired by [Cameron Beccario's Earth](https://earth.nullschool.net/) and the [hint.fm wind map](http://hint.fm/wind/).
