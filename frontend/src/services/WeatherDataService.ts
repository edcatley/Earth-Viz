/**
 * Clean weather data service that fetches JSON from our Python backend
 */

// Local debug logging function
function debugLog(section: string, message: string, data?: any): void {
    if (data !== undefined) {
        console.log(`[${section}] ${message}`, data);
    } else {
        console.log(`[${section}] ${message}`);
    }
}

export interface WeatherData {
    metadata: {
        parameter: string;
        name: string;
        units: string;
        level: number;
        dataDate: number;
        dataTime: number;
        forecastTime?: number;
    };
    grid: {
        nx: number;
        ny: number;
        lat_first: number;
        lon_first: number;
        dx: number;
        dy: number;
    };
    values: number[];
}

export interface VectorWeatherData {
    metadata: {
        u_parameter: string;
        v_parameter: string;
        name: string;
        units: string;
        level: number;
        dataDate: number;
        dataTime: number;
        forecastTime?: number;
    };
    grid: {
        nx: number;
        ny: number;
        lat_first: number;
        lon_first: number;
        dx: number;
        dy: number;
    };
    u_values: number[];
    v_values: number[];
    magnitude: number[];
    direction: number[];
}

export class WeatherDataService {
    private static instance: WeatherDataService;
    private cache: Map<string, any> = new Map();
    private get baseUrl() { return '/earth-viz/api/weather'; }

    private constructor() { }

    public static getInstance(): WeatherDataService {
        if (!WeatherDataService.instance) {
            WeatherDataService.instance = new WeatherDataService();
        }
        return WeatherDataService.instance;
    }

    /**
     * Fetch scalar weather data (temperature, pressure, etc.)
     */
    public async fetchScalarData(parameter: string, level: string, date?: Date): Promise<WeatherData> {
        const cacheKey = `scalar-${parameter}-${level}-${date?.toISOString() || 'current'}`;

        // Check cache first
        if (this.cache.has(cacheKey)) {
            debugLog('WEATHER', 'Returning cached scalar data for:', cacheKey);
            return this.cache.get(cacheKey);
        }

        try {
            debugLog('WEATHER', 'Fetching scalar data:', { parameter, level, date });

            const params = new URLSearchParams({
                parameter,
                level,
                date: date ? date.toISOString().split('T')[0].replace(/-/g, '') : 'current',
                hour: date ? String(date.getUTCHours()).padStart(2, '0') : '00'
            });

            const response = await fetch(`${this.baseUrl}/data?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            debugLog('WEATHER', 'Received scalar data:', data);

            // Cache the result
            this.cache.set(cacheKey, data);
            this.limitCacheSize();

            return data;

        } catch (error) {
            debugLog('WEATHER', 'Error fetching scalar data:', error);
            throw new Error(`Failed to fetch scalar data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Fetch vector weather data (wind U/V components)
     */
    public async fetchVectorData(uParam: string, vParam: string, level: string, date?: Date): Promise<VectorWeatherData> {
        const cacheKey = `vector-${uParam}-${vParam}-${level}-${date?.toISOString() || 'current'}`;

        // Check cache first
        if (this.cache.has(cacheKey)) {
            debugLog('WEATHER', 'Returning cached vector data for:', cacheKey);
            return this.cache.get(cacheKey);
        }

        try {
            debugLog('WEATHER', 'Fetching vector data:', { uParam, vParam, level, date });

            const params = new URLSearchParams({
                u_parameter: uParam,
                v_parameter: vParam,
                level,
                date: date ? date.toISOString().split('T')[0].replace(/-/g, '') : 'current',
                hour: date ? String(date.getUTCHours()).padStart(2, '0') : '00'
            });

            const response = await fetch(`${this.baseUrl}/vector?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            debugLog('WEATHER', 'Received vector data:', data);

            // Cache the result
            this.cache.set(cacheKey, data);
            this.limitCacheSize();

            return data;

        } catch (error) {
            debugLog('WEATHER', 'Error fetching vector data:', error);
            throw new Error(`Failed to fetch vector data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Create a grid builder for Products.ts (vector data)
     */
    public createVectorGridBuilder(vectorData: VectorWeatherData): any {
        const { grid, u_values, v_values } = vectorData;

        // Create header in the format Products.ts expects
        const header = {
            lo1: grid.lon_first,
            la1: grid.lat_first,
            dx: grid.dx,
            dy: grid.dy,
            nx: grid.nx,
            ny: grid.ny,
            refTime: this.formatReferenceTime(vectorData.metadata),
            forecastTime: vectorData.metadata.forecastTime || 0,
            centerName: "GFS / NCEP / US National Weather Service"
        };

        debugLog('WEATHER', 'Created vector grid header:', header);

        // Data function that returns [u, v] for a given index
        const dataFunction = (index: number): [number, number] | null => {
            if (index < 0 || index >= u_values.length || index >= v_values.length) {
                return null;
            }
            const u = u_values[index];
            const v = v_values[index];

            if (isNaN(u) || isNaN(v)) return null;
            return [u, v];
        };

        // Bilinear interpolation function
        const interpolateFunction = (x: number, y: number, g00: [number, number], g10: [number, number], g01: [number, number], g11: [number, number]): [number, number, number] => {
            const rx = (1 - x);
            const ry = (1 - y);
            const a = rx * ry, b = x * ry, c = rx * y, d = x * y;
            const u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
            const v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
            const magnitude = Math.sqrt(u * u + v * v);
            return [u, v, magnitude];
        };

        return {
            header,
            data: dataFunction,
            interpolate: interpolateFunction
        };
    }

    /**
     * Create a grid builder for Products.ts (scalar data)
     */
    public createScalarGridBuilder(scalarData: WeatherData): any {
        const { grid, values } = scalarData;

        // Create header in the format Products.ts expects
        const header = {
            lo1: grid.lon_first,
            la1: grid.lat_first,
            dx: grid.dx,
            dy: grid.dy,
            nx: grid.nx,
            ny: grid.ny,
            refTime: this.formatReferenceTime(scalarData.metadata),
            forecastTime: scalarData.metadata.forecastTime || 0,
            centerName: "GFS / NCEP / US National Weather Service"
        };

        debugLog('WEATHER', 'Created scalar grid header:', header);

        // Data function that returns scalar value for a given index
        const dataFunction = (index: number): number | null => {
            if (index < 0 || index >= values.length) {
                return null;
            }
            const value = values[index];
            return isNaN(value) ? null : value;
        };

        // Bilinear interpolation function for scalars
        const interpolateFunction = (x: number, y: number, g00: number, g10: number, g01: number, g11: number): number => {
            const rx = (1 - x);
            const ry = (1 - y);
            return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
        };

        return {
            header,
            data: dataFunction,
            interpolate: interpolateFunction
        };
    }

    /**
     * Format reference time from metadata
     */
    private formatReferenceTime(metadata: any): string {
        const dataDate = String(metadata.dataDate);
        const dataTime = String(metadata.dataTime).padStart(4, '0');
        const year = parseInt(dataDate.substring(0, 4));
        const month = parseInt(dataDate.substring(4, 6)) - 1; // JS months are 0-based
        const day = parseInt(dataDate.substring(6, 8));
        const hour = parseInt(dataTime.substring(0, 2));
        const minute = parseInt(dataTime.substring(2, 4));

        return new Date(year, month, day, hour, minute).toISOString();
    }

    /**
     * Limit cache size
     */
    private limitCacheSize(): void {
        if (this.cache.size > 10) {
            const iterator = this.cache.keys();
            const firstResult = iterator.next();
            if (!firstResult.done) {
                this.cache.delete(firstResult.value);
            }
        }
    }

    /**
     * Clear the cache
     */
    public clearCache(): void {
        this.cache.clear();
        debugLog('WEATHER', 'Cache cleared');
    }
}

// Export the singleton instance
export const weatherDataService = WeatherDataService.getInstance();