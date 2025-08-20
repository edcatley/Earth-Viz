# Earth Visualization Package

A powerful, interactive Earth visualization library for displaying global weather patterns, wind data, and other geospatial information.

## Installation

```bash
# For local development
npm link /path/to/earth-viz

# From npm (once published)
npm install earth-viz
```

## Backend Setup

This package includes a Python backend for data processing and API services. To set up the backend:

```bash
# Install Python dependencies
npm run setup:backend

# Start the backend server
npm run start:backend
```

### Python Requirements

The backend requires Python 3.7+ and the following packages:
- Flask
- NumPy
- Pillow
- Requests

All dependencies are listed in the `backend/requirements.txt` file and will be installed with the setup command.

## Complete Usage

### Running Both Frontend and Backend

For development, you can run both the frontend and backend simultaneously:

```bash
# Start both frontend and backend servers
npm run start:all
```

### Frontend Usage

```javascript
import { EarthModernApp } from 'earth-viz';

// Create an Earth visualization instance
const earth = new EarthModernApp({
  containerId: 'earth-container',
  projection: 'orthographic',
  // Additional configuration options
});

// Start the visualization
earth.start();
```

### Backend API Configuration

By default, the Earth visualization connects to a backend at `http://localhost:5000`. You can configure a different backend URL:

```javascript
import { EarthModernApp } from 'earth-viz';

const earth = new EarthModernApp({
  containerId: 'earth-container',
  backendUrl: 'https://your-custom-backend.com',
  // Other options...
});
```

## Configuration Options

The `EarthModernApp` constructor accepts a configuration object with the following options:

```typescript
interface EarthAppConfig {
  containerId: string;         // ID of the HTML element to contain the visualization
  projection?: string;         // Map projection type ('orthographic', 'equirectangular', etc.)
  animationEnabled?: boolean;  // Whether animation is enabled
  // Additional configuration options...
}
```

## Available Projections

The package supports multiple map projections:

- `orthographic` - 3D globe view
- `equirectangular` - Flat map view
- `mercator` - Standard web mapping projection
- `waterman` - Butterfly projection
- `patterson` - Compromise projection

## Examples

### Creating a Wind Visualization

```javascript
import { EarthModernApp } from 'earth-viz';

const earth = new EarthModernApp({
  containerId: 'earth-container',
  projection: 'orthographic',
  product: 'wind',
  date: new Date()
});

earth.start();
```

## API Reference

See the TypeScript definitions for complete API documentation.

## License

MIT
