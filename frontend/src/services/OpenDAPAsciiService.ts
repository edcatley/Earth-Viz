/**
 * OpenDAP ASCII Weather Data Service - Pure text parsing, no libraries
 * Fetches ASCII .ascii data through backend proxy and parses as text
 */

// Type definitions
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
    // Wind components
    'UGRD': 'ugrd',
    'VGRD': 'vgrd',
    'GUST': 'gust',

    // Temperature and humidity
    'TMP': 'tmp',
    'RH': 'rh',

    // Pressure
    'PRMSL': 'prmsl',  // Mean sea level pressure

    // Precipitation and water
    'APCP': 'apcp',    // Accumulated precipitation
    'PWAT': 'pwat',    // Precipitable water (entire atmosphere) -> pwatclm
    'CWAT': 'cwat',    // Cloud water (entire atmosphere) -> cwatclm

    // Cloud cover
    'TCDC': 'tcdc',

    // Ocean (if available)
    'UOGRD': 'uogrd',  // Ocean U-component
    'VOGRD': 'vogrd',  // Ocean V-component

    // Waves (if available)
    'DIRPW': 'dirpw',  // Primary wave direction
    'PERPW': 'perpw',  // Primary wave period
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
    private proxyUrl = '/earth-viz/api/proxy/opendap';
    // Use 1° resolution for better performance on low-end devices
    private opendapBaseUrl = 'https://nomads.ncep.noaa.gov/dods/gfs_1p00';

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
            // 1° resolution: 181 lats × 360 lons
            const levelIdx = PRESSURE_LEVEL_MAP[pressureMb] || 0;
            varName = `${opendapParam}prs`;
            constraint = `${varName}[0][${levelIdx}][0:180][0:359]`;
        } else if (level.includes('entire_atmosphere')) {
            // Entire atmosphere (column-integrated): variable[time][lat][lon]
            // OpenDAP uses 'clm' suffix, not 'eatm'
            varName = `${opendapParam}clm`;
            constraint = `${varName}[0][0:180][0:359]`;
        } else if (level.includes('2_m')) {
            // 2m above ground: variable[time][lat][lon]
            varName = `${opendapParam}2m`;
            constraint = `${varName}[0][0:180][0:359]`;
        } else if (level.includes('10_m')) {
            // 10m above ground: variable[time][lat][lon]
            varName = `${opendapParam}10m`;
            constraint = `${varName}[0][0:180][0:359]`;
        } else if (level.includes('mean_sea_level')) {
            // Mean sea level: variable[time][lat][lon]
            varName = `${opendapParam}msl`;
            constraint = `${varName}[0][0:180][0:359]`;
        } else {
            // Default to surface: variable[time][lat][lon]
            varName = `${opendapParam}sfc`;
            constraint = `${varName}[0][0:180][0:359]`;
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
        const opendapUrl = `${this.opendapBaseUrl}/gfs${dateStr}/gfs_1p00_${hourStr}z.ascii?${constraint}`;

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
        debugLog('OPENDAP-ASCII', 'Expected values (1° resolution):', 181 * 360);

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

        try {
            debugLog('OPENDAP-ASCII', 'Fetching scalar data:', { parameter, level, date: dateStr, hour: hourStr });

            const opendapUrl = this.buildOpenDAPUrl(parameter, level, dateStr, hourStr);
            const { varName } = this.getVariableInfo(parameter, level);

            const values = await this.fetchAsciiData(opendapUrl, varName);

            // OpenDAP returns data south-to-north, we need north-to-south
            // Flip the data vertically (1° resolution)
            const ny = 181;
            const nx = 360;
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
                    nx: 360,
                    ny: 181,
                    lat_first: 90.0,
                    lon_first: 0.0,
                    dx: 1.0,
                    dy: 1.0
                },
                values: flippedValues
            };

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

            return vectorData;

        } catch (error) {
            debugLog('OPENDAP-ASCII', 'Error fetching vector data:', error);
            throw new Error(`Failed to fetch vector data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Create a grid builder for Products.ts (vector data)
     */
    public createVectorGridBuilder(vectorData: VectorWeatherData): any {
        const { grid, u_values, v_values } = vectorData;

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

        const dataFunction = (index: number): [number, number] | null => {
            if (index < 0 || index >= u_values.length || index >= v_values.length) {
                return null;
            }
            const u = u_values[index];
            const v = v_values[index];
            if (isNaN(u) || isNaN(v)) return null;
            return [u, v];
        };

        const interpolateFunction = (x: number, y: number, g00: [number, number], g10: [number, number], g01: [number, number], g11: [number, number]): [number, number, number] => {
            const rx = (1 - x);
            const ry = (1 - y);
            const a = rx * ry, b = x * ry, c = rx * y, d = x * y;
            const u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
            const v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
            const magnitude = Math.sqrt(u * u + v * v);
            return [u, v, magnitude];
        };

        return { header, data: dataFunction, interpolate: interpolateFunction };
    }

    /**
     * Create a grid builder for Products.ts (scalar data)
     */
    public createScalarGridBuilder(scalarData: WeatherData): any {
        const { grid, values } = scalarData;

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

        const dataFunction = (index: number): number | null => {
            if (index < 0 || index >= values.length) {
                return null;
            }
            const value = values[index];
            return isNaN(value) ? null : value;
        };

        const interpolateFunction = (x: number, y: number, g00: number, g10: number, g01: number, g11: number): number => {
            const rx = (1 - x);
            const ry = (1 - y);
            return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
        };

        return { header, data: dataFunction, interpolate: interpolateFunction };
    }

    /**
     * Format reference time from metadata
     */
    private formatReferenceTime(metadata: any): string {
        const dataDate = String(metadata.dataDate);
        const dataTime = String(metadata.dataTime).padStart(4, '0');
        const year = parseInt(dataDate.substring(0, 4));
        const month = parseInt(dataDate.substring(4, 6)) - 1;
        const day = parseInt(dataDate.substring(6, 8));
        const hour = parseInt(dataTime.substring(0, 2));
        const minute = parseInt(dataTime.substring(2, 4));
        return new Date(year, month, day, hour, minute).toISOString();
    }
}

// Export the singleton instance
export const openDAPAsciiService = OpenDAPAsciiService.getInstance();
