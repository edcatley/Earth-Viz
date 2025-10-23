/**
 * OpenDAP ASCII Weather Data Service - Pure text parsing, no libraries
 * Fetches ASCII .ascii data through backend proxy and parses as text
 */

import { WeatherData, VectorWeatherData } from './WeatherDataService';

// Local debug logging function
function debugLog(section: string, message: string, data?: any): void {
    if (data !== undefined) {
        console.log(`[${section}] ${message}`, data);
    } else {
        console.log(`[${section}] ${message}`);
    }
}

// Parameter name mapping: our names -> OpenDAP variable base names
const PARAMETER_MAP: Record<string, string> = {
    'TMP': 'tmp',
    'UGRD': 'ugrd',
    'VGRD': 'vgrd',
    'RH': 'rh',
    'PRMSL': 'prmsl',
    'APCP': 'apcp',
    'TCDC': 'tcdc',
    'GUST': 'gust',
};

// Pressure level mapping: mb -> OpenDAP index
const PRESSURE_LEVEL_MAP: Record<number, number> = {
    1000: 0, 975: 1, 950: 2, 925: 3, 900: 4,
    850: 5, 800: 6, 750: 7, 700: 8, 650: 9,
    600: 10, 550: 11, 500: 12, 450: 13, 400: 14,
    350: 15, 300: 16, 250: 17, 200: 18, 150: 19,
    100: 20, 70: 21, 50: 22, 30: 23, 20: 24,
    10: 25, 7: 26, 5: 27, 3: 28, 2: 29, 1: 30
};

export class OpenDAPAsciiService {
    private static instance: OpenDAPAsciiService;
    private cache: Map<string, any> = new Map();
    private proxyUrl = '/earth-viz/api/proxy/opendap';
    private opendapBaseUrl = 'https://nomads.ncep.noaa.gov/dods/gfs_0p25';

    private constructor() { }

    public static getInstance(): OpenDAPAsciiService {
        if (!OpenDAPAsciiService.instance) {
            OpenDAPAsciiService.instance = new OpenDAPAsciiService();
        }
        return OpenDAPAsciiService.instance;
    }

    /**
     * Get OpenDAP variable name and level constraint for a parameter
     */
    private getVariableInfo(parameter: string, level: string): { varName: string; constraint: string } {
        // Map parameter name
        const opendapParam = PARAMETER_MAP[parameter] || parameter.toLowerCase();
        
        // Determine if this is an isobaric level and extract pressure value
        let pressureMb: number | null = null;
        if (level.startsWith('isobaric_')) {
            pressureMb = parseInt(level.split('_')[1]);
        } else if (level.includes('_mb')) {
            pressureMb = parseInt(level.split('_')[0]);
        } else if (level.endsWith('mb')) {
            pressureMb = parseInt(level.slice(0, -2));
        } else if (/^\d+$/.test(level)) {
            pressureMb = parseInt(level);
        }
        
        // Determine variable name and constraint
        let varName: string;
        let constraint: string;
        
        if (pressureMb !== null) {
            // Isobaric level: variable[time][level][lat][lon]
            const levelIdx = PRESSURE_LEVEL_MAP[pressureMb] || 0;
            varName = `${opendapParam}prs`;
            constraint = `${varName}[0][${levelIdx}][0:720][0:1439]`;
        } else if (level.includes('2_m')) {
            // 2m above ground: variable[time][lat][lon]
            varName = `${opendapParam}2m`;
            constraint = `${varName}[0][0:720][0:1439]`;
        } else if (level.includes('10_m')) {
            // 10m above ground: variable[time][lat][lon]
            varName = `${opendapParam}10m`;
            constraint = `${varName}[0][0:720][0:1439]`;
        } else if (level.includes('mean_sea_level')) {
            // Mean sea level: variable[time][lat][lon]
            varName = `${opendapParam}msl`;
            constraint = `${varName}[0][0:720][0:1439]`;
        } else {
            // Default to surface: variable[time][lat][lon]
            varName = `${opendapParam}sfc`;
            constraint = `${varName}[0][0:720][0:1439]`;
        }
        
        return { varName, constraint };
    }

    /**
     * Build OpenDAP ASCII URL for a specific parameter
     */
    private buildOpenDAPUrl(parameter: string, level: string, date: string, hour: string): string {
        // Handle current date/hour
        let dateStr: string;
        let hourStr: string;
        
        if (date === 'current') {
            const now = new Date();
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            dateStr = yesterday.toISOString().split('T')[0].replace(/-/g, '');
            hourStr = '18';
        } else {
            dateStr = date.replace(/[/-]/g, '');
            hourStr = hour.padStart(2, '0');
        }
        
        const { constraint } = this.getVariableInfo(parameter, level);
        const opendapUrl = `${this.opendapBaseUrl}/gfs${dateStr}/gfs_0p25_${hourStr}z.ascii?${constraint}`;
        
        return opendapUrl;
    }

    /**
     * Parse OpenDAP ASCII response into float array
     * Format: varname, [dims]
     *         [indices], value, value, value, ...
     */
    private parseAsciiData(text: string, varName: string): number[] {
        debugLog('OPENDAP-ASCII', 'Parsing ASCII data, length:', text.length);
        debugLog('OPENDAP-ASCII', 'Looking for variable:', varName);
        
        const lines = text.split('\n');
        const values: number[] = [];
        let inDataSection = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            
            // Skip empty lines
            if (!trimmed) continue;
            
            // Look for the variable data section (format: "varname, [dims]")
            if (trimmed.startsWith(varName + ',')) {
                debugLog('OPENDAP-ASCII', 'Found variable section:', trimmed);
                inDataSection = true;
                continue;
            }
            
            // Exit data section when we hit a new variable or coordinate
            if (inDataSection && !trimmed.startsWith('[')) {
                debugLog('OPENDAP-ASCII', 'Exiting data section');
                break;
            }
            
            // Parse data lines (format: "[indices], value, value, value, ...")
            if (inDataSection && trimmed.startsWith('[')) {
                // Remove the index part (e.g., "[0][0], " -> "")
                const commaIndex = trimmed.indexOf(',');
                if (commaIndex === -1) continue;
                
                const dataStr = trimmed.substring(commaIndex + 1);
                
                // Parse comma-separated values
                const parts = dataStr.split(',');
                for (const part of parts) {
                    const value = parseFloat(part.trim());
                    if (!isNaN(value)) {
                        values.push(value);
                    }
                }
            }
        }
        
        debugLog('OPENDAP-ASCII', 'Parsed values count:', values.length);
        debugLog('OPENDAP-ASCII', 'Expected values:', 721 * 1440);
        
        if (values.length > 0) {
            debugLog('OPENDAP-ASCII', 'First 10 values:', values.slice(0, 10));
            debugLog('OPENDAP-ASCII', 'Last 10 values:', values.slice(-10));
        }
        
        return values;
    }

    /**
     * Fetch ASCII data through streaming proxy
     */
    private async fetchAsciiData(opendapUrl: string, varName: string): Promise<number[]> {
        const proxyedUrl = `${this.proxyUrl}?url=${encodeURIComponent(opendapUrl)}`;
        
        debugLog('OPENDAP-ASCII', 'Fetching from proxy:', proxyedUrl);
        
        const response = await fetch(proxyedUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const text = await response.text();
        debugLog('OPENDAP-ASCII', 'Received ASCII data, size:', text.length);
        
        return this.parseAsciiData(text, varName);
    }

    /**
     * Fetch scalar weather data (temperature, pressure, etc.)
     */
    public async fetchScalarData(parameter: string, level: string, date?: Date): Promise<WeatherData> {
        const dateStr = date ? date.toISOString().split('T')[0].replace(/-/g, '') : 'current';
        const hourStr = date ? String(date.getUTCHours()).padStart(2, '0') : '00';
        const cacheKey = `scalar-${parameter}-${level}-${dateStr}-${hourStr}`;

        // Check cache first
        if (this.cache.has(cacheKey)) {
            debugLog('OPENDAP-ASCII', 'Returning cached scalar data for:', cacheKey);
            return this.cache.get(cacheKey);
        }

        try {
            debugLog('OPENDAP-ASCII', 'Fetching scalar data:', { parameter, level, date: dateStr, hour: hourStr });

            const opendapUrl = this.buildOpenDAPUrl(parameter, level, dateStr, hourStr);
            const { varName } = this.getVariableInfo(parameter, level);
            
            const values = await this.fetchAsciiData(opendapUrl, varName);
            
            // OpenDAP returns data south-to-north, we need north-to-south
            // Flip the data vertically
            const ny = 721;
            const nx = 1440;
            const flippedValues = new Array(values.length);
            
            for (let y = 0; y < ny; y++) {
                for (let x = 0; x < nx; x++) {
                    const srcIdx = y * nx + x;
                    const dstIdx = (ny - 1 - y) * nx + x;
                    flippedValues[dstIdx] = values[srcIdx];
                }
            }

            // Build response in WeatherData format
            const weatherData: WeatherData = {
                metadata: {
                    parameter,
                    name: parameter,
                    units: 'unknown',
                    level: 0,
                    dataDate: parseInt(dateStr),
                    dataTime: parseInt(hourStr) * 100,
                    forecastTime: 0
                },
                grid: {
                    nx: 1440,
                    ny: 721,
                    lat_first: 90.0,
                    lon_first: 0.0,
                    dx: 0.25,
                    dy: 0.25
                },
                values: flippedValues
            };

            // Cache the result
            this.cache.set(cacheKey, weatherData);
            this.limitCacheSize();

            return weatherData;

        } catch (error) {
            debugLog('OPENDAP-ASCII', 'Error fetching scalar data:', error);
            throw new Error(`Failed to fetch scalar data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Fetch vector weather data (wind U/V components)
     */
    public async fetchVectorData(uParam: string, vParam: string, level: string, date?: Date): Promise<VectorWeatherData> {
        const dateStr = date ? date.toISOString().split('T')[0].replace(/-/g, '') : 'current';
        const hourStr = date ? String(date.getUTCHours()).padStart(2, '0') : '00';
        const cacheKey = `vector-${uParam}-${vParam}-${level}-${dateStr}-${hourStr}`;

        // Check cache first
        if (this.cache.has(cacheKey)) {
            debugLog('OPENDAP-ASCII', 'Returning cached vector data for:', cacheKey);
            return this.cache.get(cacheKey);
        }

        try {
            debugLog('OPENDAP-ASCII', 'Fetching vector data:', { uParam, vParam, level, date: dateStr, hour: hourStr });

            // Fetch both components in parallel
            const [uData, vData] = await Promise.all([
                this.fetchScalarData(uParam, level, date),
                this.fetchScalarData(vParam, level, date)
            ]);

            // Calculate magnitude and direction
            const magnitude = new Array(uData.values.length);
            const direction = new Array(uData.values.length);

            for (let i = 0; i < uData.values.length; i++) {
                const u = uData.values[i];
                const v = vData.values[i];
                magnitude[i] = Math.sqrt(u * u + v * v);
                direction[i] = (Math.atan2(u, v) * 180 / Math.PI) % 360;
            }

            const vectorData: VectorWeatherData = {
                metadata: {
                    u_parameter: uParam,
                    v_parameter: vParam,
                    name: `${uParam}/${vParam} Vector`,
                    units: uData.metadata.units,
                    level: uData.metadata.level,
                    dataDate: uData.metadata.dataDate,
                    dataTime: uData.metadata.dataTime,
                    forecastTime: uData.metadata.forecastTime
                },
                grid: uData.grid,
                u_values: uData.values,
                v_values: vData.values,
                magnitude,
                direction
            };

            // Cache the result
            this.cache.set(cacheKey, vectorData);
            this.limitCacheSize();

            return vectorData;

        } catch (error) {
            debugLog('OPENDAP-ASCII', 'Error fetching vector data:', error);
            throw new Error(`Failed to fetch vector data: ${error instanceof Error ? error.message : String(error)}`);
        }
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
        debugLog('OPENDAP-ASCII', 'Cache cleared');
    }
}

// Export the singleton instance
export const openDAPAsciiService = OpenDAPAsciiService.getInstance();
