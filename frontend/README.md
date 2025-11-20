# Earth-Viz Frontend

Interactive 3D globe visualization built with TypeScript, D3, and WebGL. This is the web application component of the `earth-viz` package.

## Overview

The frontend is a single-page application that renders an interactive globe with real-time weather data visualization. It's bundled as static files within the Python package and served by the FastAPI backend at `/earth-viz-app/`.

## Features

- **Multiple Projections**: Orthographic (3D globe), equirectangular, Waterman butterfly, Patterson, Winkel tripel, and more
- **Particle Systems**: Real-time WebGL particle animations for wind, ocean currents, and waves
- **Weather Overlays**: Temperature, humidity, pressure, wind speed, sea surface temperature
- **Planet Mode**: View Earth, Mars, Venus, Jupiter, Saturn, and other planets with accurate textures
- **Day/Night Blending**: Realistic day/night terminator with blended lighting
- **Interactive Controls**: Mouse/touch drag to rotate, scroll to zoom, click for coordinates
- **Time Navigation**: Browse historical and forecast weather data
- **WebSocket Control**: Programmatic control via backend API

## Architecture

The application uses a clean, modular architecture with separated concerns:

### Core Systems

- **EarthModernApp**: Main application class that orchestrates all systems
- **ConfigManager**: Centralized configuration state management
- **Globes**: D3-based projection system supporting multiple map projections

### Rendering Systems

- **RenderSystem**: Coordinates all rendering operations
- **ParticleSystem**: WebGL particle simulation and rendering
- **MeshSystem**: Coastlines, lakes, and rivers rendering
- **OverlaySystem**: Weather data overlay rendering with color scales
- **PlanetSystem**: Planet texture rendering with day/night blending

### Data Management

- **ProductManager**: Caches and manages weather data products
- **WeatherProduct**: Represents a single weather parameter (wind, temp, etc.)
- **ProductCatalog**: Defines available weather parameters and their properties

### UI Components

- **MenuSystem**: Interactive menu for mode selection, projections, and data layers
- **InputHandler**: Mouse/touch interaction handling for globe manipulation

## Data Flow

1. **Configuration Change**: User interacts with menu or API sends command
2. **Config Update**: ConfigManager updates state and notifies listeners
3. **Data Loading**: ProductManager fetches required weather data from backend
4. **System Updates**: Each rendering system receives updated data and state
5. **WebGL Rendering**: RenderSystem coordinates frame rendering with all active layers
6. **Animation Loop**: Particle system evolves and renders at 25fps

## Weather Data

The frontend fetches weather data from the backend, which proxies NOAA data sources:

- **OpenDAP**: Primary data source for gridded weather fields
- **GRIB2**: Fallback data format via backend proxy
- **Real-time Clouds**: Generated server-side from satellite imagery

Weather data is cached by the ProductManager to avoid redundant requests.

## WebSocket API

The frontend connects to `/earth-viz/ws` to receive control commands:

```javascript
{
  "type": "EARTH_COMMAND",
  "command": "setProjection",
  "params": ["waterman"]
}
```

This enables programmatic control from Python or other clients.

## Technology Stack

- **TypeScript**: Type-safe application code
- **D3.js**: Map projections, geo path rendering, SVG manipulation
- **WebGL**: Hardware-accelerated particle rendering and overlays
- **Vite**: Build tooling and development server
- **CSS3**: Responsive styling and animations

## How It Works

### Initialization

When the page loads, `EarthModernApp` initializes:

1. Creates all rendering systems (particles, mesh, overlay, planet)
2. Initializes WebGL contexts on canvas elements
3. Loads static mesh data (coastlines, lakes, rivers)
4. Creates initial globe projection
5. Loads weather data from backend
6. Sets up input handlers for interaction
7. Starts rendering loop

### Rendering Pipeline

Each frame:

1. **Clear**: Clear canvas buffers
2. **Planet/Mesh**: Render planet texture or coastline mesh
3. **Overlay**: Render weather data overlay (if enabled)
4. **Particles**: Evolve and render particle positions (if enabled)
5. **SVG**: Update graticule and grid lines (if visible)

### Interaction

- **Drag**: Rotates globe by updating projection orientation
- **Scroll**: Zooms in/out by adjusting projection scale
- **Click**: Shows coordinates and location marker
- **Menu**: Changes modes, projections, data layers

### State Management

All application state lives in `ConfigManager`:
- Current projection and orientation
- Active mode (air/ocean/planet)
- Selected particle and overlay types
- Atmospheric level
- Time selection
- UI visibility

State changes trigger reactive updates through the system.

## Supported Data

### Projections

- `orthographic` - 3D globe view (default)
- `equirectangular` - Flat rectangular map
- `waterman` - Waterman butterfly projection
- `patterson` - Patterson cylindrical projection
- `winkel3` - Winkel tripel projection
- `conicEquidistant` - Conic equidistant projection

### Weather Parameters

**Particle Types:**
- `wind` - Wind vectors at various atmospheric levels
- `currents` - Ocean surface currents
- `waves` - Ocean wave direction and height

**Overlay Types:**
- `temp` - Temperature
- `humidity` - Relative humidity
- `pressure` - Mean sea level pressure
- `wind` - Wind speed magnitude
- `sst` - Sea surface temperature

**Atmospheric Levels:**
- `surface` - Surface level
- `1000hPa`, `850hPa`, `500hPa`, `250hPa` - Pressure levels
- `10m` - 10 meters above ground

### Planets

Earth, Mars, Venus, Moon, Mercury, Jupiter, Saturn, Uranus, Neptune

## Performance

- WebGL-accelerated rendering for smooth 60fps
- Particle system runs at 25fps (40ms per frame)
- Efficient data caching to minimize backend requests
- Responsive design adapts to viewport size
- Optimized for both desktop and mobile devices

## Development

For local development:

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and requires the backend running on `http://localhost:8000` for weather data.

## Browser Requirements

- WebGL support (all modern browsers)
- Chrome, Firefox, Safari, Edge (latest versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

MIT
