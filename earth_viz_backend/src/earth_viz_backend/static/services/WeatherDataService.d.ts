/**
 * Clean weather data service that fetches JSON from our Python backend
 */
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
export declare class WeatherDataService {
    private static instance;
    private cache;
    private get baseUrl();
    private constructor();
    static getInstance(): WeatherDataService;
    /**
     * Fetch scalar weather data (temperature, pressure, etc.)
     */
    fetchScalarData(parameter: string, level: string, date?: Date): Promise<WeatherData>;
    /**
     * Fetch vector weather data (wind U/V components)
     */
    fetchVectorData(uParam: string, vParam: string, level: string, date?: Date): Promise<VectorWeatherData>;
    /**
     * Create a grid builder for Products.ts (vector data)
     */
    createVectorGridBuilder(vectorData: VectorWeatherData): any;
    /**
     * Create a grid builder for Products.ts (scalar data)
     */
    createScalarGridBuilder(scalarData: WeatherData): any;
    /**
     * Format reference time from metadata
     */
    private formatReferenceTime;
    /**
     * Limit cache size
     */
    private limitCacheSize;
    /**
     * Clear the cache
     */
    clearCache(): void;
}
export declare const weatherDataService: WeatherDataService;
//# sourceMappingURL=WeatherDataService.d.ts.map