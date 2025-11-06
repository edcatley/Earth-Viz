/**
 * WeatherProduct - Clean, modern weather data management
 * 
 * Design principles:
 * 1. Single source of truth - one copy of data in memory
 * 2. Direct array access - no unnecessary 2D arrays
 * 3. Clear ownership - product owns its data
 * 4. Simple API - no builder pattern nonsense
 * 5. Easy to cache - just cache the product instance
 */

import { openDAPAsciiService } from '../services/OpenDAPAsciiService';

// =================== CORE TYPES ===================

export type WeatherDataType = 'scalar' | 'vector';

export interface WeatherProductConfig {
    name: string;
    description: string;
    type: WeatherDataType;
    parameters: string[];  // e.g., ['TMP'] or ['UGRD', 'VGRD']
    level: string;
    date: Date;
    units: Array<{ label: string; conversion: (x: number) => number; precision: number; }>;
    scale?: { bounds: [number, number]; gradient: (value: number, alpha: number) => number[]; };
    particles?: { velocityScale: number; maxIntensity: number; style?: string; };
}

// =================== BASE WEATHER PRODUCT ===================

export abstract class WeatherProduct {
    // Metadata
    public readonly name: string;
    public readonly description: string;
    public readonly type: WeatherDataType;
    public readonly date: Date;
    public readonly source: string = "GFS / NCEP / US National Weather Service";
    
    // Grid info
    protected readonly nx: number;
    protected readonly ny: number;
    protected readonly lon0: number;
    protected readonly lat0: number;
    protected readonly dx: number;
    protected readonly dy: number;
    
    // Display config
    public readonly units: Array<{ label: string; conversion: (x: number) => number; precision: number; }>;
    public readonly scale?: { bounds: [number, number]; gradient: (value: number, alpha: number) => number[]; };
    public readonly particles?: { velocityScale: number; maxIntensity: number; style?: string; };
    
    constructor(config: WeatherProductConfig, gridInfo: { nx: number; ny: number; lon0: number; lat0: number; dx: number; dy: number }) {
        this.name = config.name;
        this.description = config.description;
        this.type = config.type;
        this.date = config.date;
        this.units = config.units;
        this.scale = config.scale;
        this.particles = config.particles;
        
        this.nx = gridInfo.nx;
        this.ny = gridInfo.ny;
        this.lon0 = gridInfo.lon0;
        this.lat0 = gridInfo.lat0;
        this.dx = gridInfo.dx;
        this.dy = gridInfo.dy;
    }
    
    // Abstract methods - implemented by subclasses
    abstract interpolate(lon: number, lat: number): number | [number, number, number] | null;
    abstract forEachPoint(callback: (lon: number, lat: number, value: any) => void): void;
    
    // Helper: convert lon/lat to grid indices
    protected lonLatToIndices(lon: number, lat: number): { i: number; j: number; fi: number; fj: number; ci: number; cj: number; x: number; y: number } {
        // Normalize longitude to [0, 360)
        const normalizedLon = ((lon % 360) + 360) % 360;
        
        const i = (normalizedLon - this.lon0) / this.dx;
        const j = (this.lat0 - lat) / this.dy;
        
        const fi = Math.floor(i);
        const fj = Math.floor(j);
        const ci = fi + 1;
        const cj = fj + 1;
        
        const x = i - fi;  // fractional part for interpolation
        const y = j - fj;
        
        return { i, j, fi, fj, ci, cj, x, y };
    }
    
    // Helper: bilinear interpolation
    protected bilinearInterpolate(x: number, y: number, g00: number, g10: number, g01: number, g11: number): number {
        const rx = (1 - x);
        const ry = (1 - y);
        return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
    }
}

// =================== SCALAR PRODUCT ===================

export class ScalarWeatherProduct extends WeatherProduct {
    private readonly data: Float32Array;  // THE ONLY COPY - 260KB
    
    constructor(config: WeatherProductConfig, data: Float32Array, gridInfo: { nx: number; ny: number; lon0: number; lat0: number; dx: number; dy: number }) {
        super(config, gridInfo);
        this.data = data;
    }
    
    // Get value at specific grid index
    private getValue(i: number, j: number): number | null {
        // Handle wrapping for continuous longitude
        const wrappedI = ((i % this.nx) + this.nx) % this.nx;
        
        if (j < 0 || j >= this.ny) return null;
        
        const index = j * this.nx + wrappedI;
        const value = this.data[index];
        
        return (value != null && isFinite(value)) ? value : null;
    }
    
    // Interpolate value at lon/lat
    interpolate(lon: number, lat: number): number | null {
        const { fi, fj, ci, cj, x, y } = this.lonLatToIndices(lon, lat);
        
        const g00 = this.getValue(fi, fj);
        const g10 = this.getValue(ci, fj);
        const g01 = this.getValue(fi, cj);
        const g11 = this.getValue(ci, cj);
        
        if (g00 == null || g10 == null || g01 == null || g11 == null) {
            return null;
        }
        
        return this.bilinearInterpolate(x, y, g00, g10, g01, g11);
    }
    
    // Iterate all points
    forEachPoint(callback: (lon: number, lat: number, value: number) => void): void {
        for (let j = 0; j < this.ny; j++) {
            for (let i = 0; i < this.nx; i++) {
                const lon = this.lon0 + i * this.dx;
                const lat = this.lat0 - j * this.dy;
                const value = this.getValue(i, j);
                if (value != null) {
                    callback(lon, lat, value);
                }
            }
        }
    }
}

// =================== VECTOR PRODUCT ===================

export class VectorWeatherProduct extends WeatherProduct {
    private readonly uData: Float32Array;  // U component - 260KB
    private readonly vData: Float32Array;  // V component - 260KB
    // Total: 520KB (vs 4.1MB in old system!)
    
    constructor(config: WeatherProductConfig, uData: Float32Array, vData: Float32Array, gridInfo: { nx: number; ny: number; lon0: number; lat0: number; dx: number; dy: number }) {
        super(config, gridInfo);
        this.uData = uData;
        this.vData = vData;
    }
    
    // Get vector at specific grid index
    private getVector(i: number, j: number): [number, number] | null {
        // Handle wrapping for continuous longitude
        const wrappedI = ((i % this.nx) + this.nx) % this.nx;
        
        if (j < 0 || j >= this.ny) return null;
        
        const index = j * this.nx + wrappedI;
        const u = this.uData[index];
        const v = this.vData[index];
        
        if (u == null || v == null || !isFinite(u) || !isFinite(v)) {
            return null;
        }
        
        return [u, v];
    }
    
    // Interpolate vector at lon/lat
    interpolate(lon: number, lat: number): [number, number, number] | null {
        const { fi, fj, ci, cj, x, y } = this.lonLatToIndices(lon, lat);
        
        const g00 = this.getVector(fi, fj);
        const g10 = this.getVector(ci, fj);
        const g01 = this.getVector(fi, cj);
        const g11 = this.getVector(ci, cj);
        
        if (!g00 || !g10 || !g01 || !g11) {
            return null;
        }
        
        // Bilinear interpolation for both components
        const rx = (1 - x);
        const ry = (1 - y);
        const a = rx * ry, b = x * ry, c = rx * y, d = x * y;
        
        const u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        const v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        const magnitude = Math.sqrt(u * u + v * v);
        
        return [u, v, magnitude];
    }
    
    // Iterate all points (returns magnitude for overlays)
    forEachPoint(callback: (lon: number, lat: number, value: number) => void): void {
        for (let j = 0; j < this.ny; j++) {
            for (let i = 0; i < this.nx; i++) {
                const lon = this.lon0 + i * this.dx;
                const lat = this.lat0 - j * this.dy;
                const vector = this.getVector(i, j);
                if (vector) {
                    const magnitude = Math.sqrt(vector[0] * vector[0] + vector[1] * vector[1]);
                    callback(lon, lat, magnitude);
                }
            }
        }
    }
}

// =================== PRODUCT FACTORY ===================

export class WeatherProductFactory {
    /**
     * Create a scalar product (temperature, pressure, humidity, etc.)
     */
    static async createScalar(config: WeatherProductConfig): Promise<ScalarWeatherProduct> {
        const param = config.parameters[0];
        const weatherData = await openDAPAsciiService.fetchScalarData(param, config.level, config.date);
        
        const gridInfo = {
            nx: weatherData.grid.nx,
            ny: weatherData.grid.ny,
            lon0: weatherData.grid.lon_first,
            lat0: weatherData.grid.lat_first,
            dx: weatherData.grid.dx,
            dy: weatherData.grid.dy
        };
        
        // Special case: convert pressure from Pa to hPa
        let data: Float32Array;
        if (config.name === 'mean_sea_level_pressure') {
            data = new Float32Array(weatherData.values.length);
            for (let i = 0; i < weatherData.values.length; i++) {
                data[i] = weatherData.values[i] / 100;
            }
        } else {
            // Convert to Float32Array if it's a regular array
            data = weatherData.values instanceof Float32Array 
                ? weatherData.values 
                : new Float32Array(weatherData.values);
        }
        
        return new ScalarWeatherProduct(config, data, gridInfo);
    }
    
    /**
     * Create a vector product (wind, ocean currents, etc.)
     */
    static async createVector(config: WeatherProductConfig): Promise<VectorWeatherProduct> {
        const [uParam, vParam] = config.parameters;
        const vectorData = await openDAPAsciiService.fetchVectorData(uParam, vParam, config.level, config.date);
        
        const gridInfo = {
            nx: vectorData.grid.nx,
            ny: vectorData.grid.ny,
            lon0: vectorData.grid.lon_first,
            lat0: vectorData.grid.lat_first,
            dx: vectorData.grid.dx,
            dy: vectorData.grid.dy
        };
        
        // Convert to Float32Array if needed
        const uData = vectorData.u_values instanceof Float32Array 
            ? vectorData.u_values 
            : new Float32Array(vectorData.u_values);
        const vData = vectorData.v_values instanceof Float32Array 
            ? vectorData.v_values 
            : new Float32Array(vectorData.v_values);
        
        return new VectorWeatherProduct(config, uData, vData, gridInfo);
    }
}
