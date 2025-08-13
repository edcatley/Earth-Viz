// Import grib2json package
import { decodeGRIB2File, GRIB2 } from 'grib22json';

// Local debug logging function
function debugLog(section: string, message: string, data?: any): void {
    if (data !== undefined) {
        console.log(`[${section}] ${message}`, data);
    } else {
        console.log(`[${section}] ${message}`);
    }
}

export interface Grib2Data {
    referenceTime: Date;
    forecastTime: Date;
    grid: {
        nx: number;
        ny: number;
        lon0: number;
        lat0: number;
        dlon: number;
        dlat: number;
    };
    values: Float32Array | number[];
    parameter: string;
    level: string;
    unit: string;
}

export interface Grib2Field {
    valueAt: (index: number) => number;
    isDefined: (index: number) => boolean;
    nearest: (lon: number, lat: number) => number;
    bilinear: (lon: number, lat: number) => number;
}

export class Grib2Service {
    private static instance: Grib2Service;
    private cache: Map<string, Grib2Data[]> = new Map();

    private constructor() { }

    public static getInstance(): Grib2Service {
        if (!Grib2Service.instance) {
            Grib2Service.instance = new Grib2Service();
        }
        return Grib2Service.instance;
    }

    /**
     * Fetch and parse GRIB2 data from NOAA NOMADS
     */
    public async fetchGrib2Data(url: string): Promise<Grib2Data[]> {
        const cacheKey = url;

        // Check cache first
        if (this.cache.has(cacheKey)) {
            debugLog('GRIB2', 'Returning cached data for:', url);
            return this.cache.get(cacheKey)!;
        }

        try {
            debugLog('GRIB2', 'Fetching GRIB2 data from:', url);

            // Fetch the GRIB2 file as ArrayBuffer
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            debugLog('GRIB2', 'Downloaded GRIB2 file size:', `${arrayBuffer.byteLength} bytes`);

            // Parse with grib22json
            const gribData = await this.parseGrib2(arrayBuffer);

            // Cache the result
            this.cache.set(cacheKey, gribData);

            // Limit cache size
            if (this.cache.size > 10) {
                const iterator = this.cache.keys();
                const firstResult = iterator.next();
                if (!firstResult.done) {
                    this.cache.delete(firstResult.value);
                }
            }

            return gribData;

        } catch (error) {
            debugLog('GRIB2', 'Error fetching GRIB2 data:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to fetch GRIB2 data: ${errorMessage}`);
        }
    }

    /**
     * Parse GRIB2 ArrayBuffer using grib22json
     */
    private async parseGrib2(arrayBuffer: ArrayBuffer): Promise<Grib2Data[]> {
        try {
            if (!decodeGRIB2File) {
                throw new Error('GRIB2 library not loaded - decodeGRIB2File function is not available');
            }

            debugLog('GRIB2', 'Attempting to decode GRIB2 file with buffer size:', arrayBuffer.byteLength);
            const gribFiles = decodeGRIB2File(arrayBuffer);

        if (!gribFiles || !gribFiles.length) {
            throw new Error('Invalid GRIB2 data structure');
        }

        debugLog('GRIB2', 'Parsed GRIB2 messages:', gribFiles.length);

        // Convert to our internal format
        const grib2Data: Grib2Data[] = gribFiles.map((gribFile: any, index: number) => {
            debugLog('GRIB2', `Processing message ${index + 1}:`, gribFile);

            if (!gribFile.data || !gribFile.data.grid || !gribFile.data.values) {
                throw new Error(`Invalid GRIB2 file structure at index ${index}`);
            }

            const { data } = gribFile;
            const { grid, values, product } = data;

            console.log('[GRIB2-PARSE] Grid info:', grid);
            console.log('[GRIB2-PARSE] Product info:', product);
            console.log('[GRIB2-PARSE] Values info:', {
                length: values.length,
                type: typeof values,
                isArray: Array.isArray(values),
                sample: values.slice(0, 5)
            });

            // Extract time information from the data template
            const section1 = gribFile.dataTemplate[1];
            const year = section1.find((item: any) => item.info === 'Year (4 digits)')?.content || new Date().getFullYear();
            const month = section1.find((item: any) => item.info === 'Month')?.content || 1;
            const day = section1.find((item: any) => item.info === 'Day')?.content || 1;
            const hour = section1.find((item: any) => item.info === 'Hour')?.content || 0;
            const minute = section1.find((item: any) => item.info === 'Minute')?.content || 0;
            const second = section1.find((item: any) => item.info === 'Second')?.content || 0;

            const referenceTime = new Date(year, month - 1, day, hour, minute, second);

            // For now, use the same time as forecast time (this would normally include forecast offset)
            const forecastTime = new Date(referenceTime);

            return {
                referenceTime,
                forecastTime,
                grid: {
                    nx: grid.numLongPoints,
                    ny: grid.numLatPoints,
                    lon0: grid.lonStart,
                    lat0: grid.latStart,
                    dlon: grid.incI,
                    dlat: grid.incJ
                },
                values: Array.isArray(values) ? new Float32Array(values) : values,
                parameter: product['Parameter number (see Code table 4.2)'] || 'Unknown',
                level: 'surface', // TODO: Extract from GRIB data
                unit: 'Unknown' // TODO: Extract from GRIB data
            } as Grib2Data;
        });

        return grib2Data;
        
        } catch (error) {
            debugLog('GRIB2', 'Error in parseGrib2:', error);
            throw new Error(`Failed to parse GRIB2 data: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Create a field interface compatible with the existing earth.js system
     */
    public createField(data: Grib2Data): Grib2Field {
        const { grid, values } = data;
        const { nx, ny, lon0, lat0, dlon, dlat } = grid;

        // Create coordinate mapping functions
        const lonToX = (lon: number): number => {
            // Normalize longitude to 0-360 range if needed
            const normalizedLon = ((lon % 360) + 360) % 360;
            return Math.floor((normalizedLon - lon0) / dlon);
        };

        const latToY = (lat: number): number => {
            return Math.floor((lat0 - lat) / dlat);
        };

        const xyToIndex = (x: number, y: number): number => {
            return y * nx + x;
        };

        return {
            valueAt: (index: number): number => {
                if (index < 0 || index >= values.length) return NaN;
                return values[index];
            },

            isDefined: (index: number): boolean => {
                if (index < 0 || index >= values.length) return false;
                const value = values[index];
                return !isNaN(value) && isFinite(value);
            },

            nearest: (lon: number, lat: number): number => {
                const x = lonToX(lon);
                const y = latToY(lat);

                if (x < 0 || x >= nx || y < 0 || y >= ny) return NaN;

                const index = xyToIndex(x, y);
                return values[index];
            },

            bilinear: (lon: number, lat: number): number => {
                const fx = (lon - lon0) / dlon;
                const fy = (lat0 - lat) / dlat;

                const x0 = Math.floor(fx);
                const y0 = Math.floor(fy);
                const x1 = x0 + 1;
                const y1 = y0 + 1;

                if (x0 < 0 || x1 >= nx || y0 < 0 || y1 >= ny) return NaN;

                const dx = fx - x0;
                const dy = fy - y0;

                const v00 = values[xyToIndex(x0, y0)];
                const v10 = values[xyToIndex(x1, y0)];
                const v01 = values[xyToIndex(x0, y1)];
                const v11 = values[xyToIndex(x1, y1)];

                if (isNaN(v00) || isNaN(v10) || isNaN(v01) || isNaN(v11)) return NaN;

                const rx = (1 - dx);
                const ry = (1 - dy);
                return v00 * rx * ry + v10 * dx * ry + v01 * rx * dy + v11 * dx * dy;
            }
        };
    }

    /**
     * Build NOAA NOMADS URL for specific parameters (via proxy to bypass CORS)
     */
    public static buildNomadsUrl(params: {
        model: string;        // e.g., 'gfs'
        resolution: string;   // e.g., '0p25' for 0.25 degree
        date: string;         // e.g., '20241201'
        cycle: string;        // e.g., '00', '06', '12', '18'
        forecast: string;     // e.g., '000', '003', '006'
        parameter: string;    // e.g., 'UGRD', 'VGRD', 'TMP'
        level: string;        // e.g., '10_m_above_ground', 'surface'
        bbox?: {              // Optional bounding box
            north: number;
            south: number;
            east: number;
            west: number;
        };
    }): string {
        // Use our backend proxy server to bypass CORS  
        const baseUrl = 'http://localhost:8000/cgi-bin/filter_gfs_0p25.pl';

        // Build URL in correct order: dir first, then file, then parameters
        let url = `${baseUrl}?dir=%2Fgfs.${params.date}%2F${params.cycle}%2Fatmos`;
        url += `&file=gfs.t${params.cycle}z.pgrb2.0p25.f000`;  // Use .anl for analysis data
        url += `&var_${params.parameter}=on`;
        url += `&lev_${params.level}=on`;

        if (params.bbox) {
            url += `&subregion=`;
            url += `&leftlon=${params.bbox.west}`;
            url += `&rightlon=${params.bbox.east}`;
            url += `&toplat=${params.bbox.north}`;
            url += `&bottomlat=${params.bbox.south}`;
        }

        return url;
    }

    /**
     * Clear the cache
     */
    public clearCache(): void {
        this.cache.clear();
        debugLog('GRIB2', 'Cache cleared');
    }

    /**
     * Create a GridBuilder compatible with the original Products.ts system
     * This returns the exact same format that the original wind product builder returned
     */
    public createGridBuilder(uData: Grib2Data, vData: Grib2Data): any {
        const { grid } = uData;

        console.log('[GRIB2-SERVICE] Creating grid builder with data:', {
            uDataLength: uData.values.length,
            vDataLength: vData.values.length,
            grid: grid,
            uSample: Array.from(uData.values.slice(0, 10)),
            vSample: Array.from(vData.values.slice(0, 10)),
            calculatedNy: uData.values.length / grid.nx
        });

        // Create header in the exact format the original system expects
        const header = {
            lo1: grid.lon0,
            la1: grid.lat0,
            dx: grid.dlon,
            dy: grid.dlat, // Use the actual latitude increment from GRIB data
            nx: grid.nx,
            ny: grid.ny,
            refTime: uData.referenceTime.toISOString(),
            forecastTime: 0, // Hours offset from reference time
            centerName: "GFS / NCEP / US National Weather Service"
        };

        console.log('[GRIB2-SERVICE] Created header:', header);

        // Data function that returns [u, v] for a given index
        const dataFunction = (index: number): [number, number] | null => {
            if (index < 0 || index >= uData.values.length || index >= vData.values.length) {
                return null;
            }
            const u = uData.values[index];
            const v = vData.values[index];

            if (isNaN(u) || isNaN(v)) return null;

            // Debug first few data points
            if (index < 5) {
                console.log(`[GRIB2-SERVICE] Data point ${index}:`, { u, v, magnitude: Math.sqrt(u * u + v * v) });
            }

            return [u, v];
        };

        // Bilinear interpolation function (same as original Products.ts)
        const interpolateFunction = (x: number, y: number, g00: [number, number], g10: [number, number], g01: [number, number], g11: [number, number]): [number, number, number] => {
            const rx = (1 - x);
            const ry = (1 - y);
            const a = rx * ry, b = x * ry, c = rx * y, d = x * y;
            const u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
            const v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
            const magnitude = Math.sqrt(u * u + v * v);
            return [u, v, magnitude];
        };

        const result = {
            header: header,
            data: dataFunction,
            interpolate: interpolateFunction
        };

        console.log('[GRIB2-SERVICE] Grid builder created successfully');

        return result;
    }

    /**
     * Create a scalar GridBuilder compatible with the original Products.ts system
     */
    public createScalarGridBuilder(data: Grib2Data): any {
        const { grid } = data;

        // Create header in the exact format the original system expects
        const header = {
            lo1: grid.lon0,
            la1: grid.lat0,
            dx: grid.dlon,
            dy: grid.dlat, // Use the actual latitude increment from GRIB data
            nx: grid.nx,
            ny: grid.ny,
            refTime: data.referenceTime.toISOString(),
            forecastTime: 0, // Hours offset from reference time
            centerName: "GFS / NCEP / US National Weather Service"
        };

        // Data function that returns scalar value for a given index
        const dataFunction = (index: number): number | null => {
            if (index < 0 || index >= data.values.length) {
                return null;
            }
            const value = data.values[index];
            return isNaN(value) ? null : value;
        };

        // Bilinear interpolation function for scalars
        const interpolateFunction = (x: number, y: number, g00: number, g10: number, g01: number, g11: number): number => {
            const rx = (1 - x);
            const ry = (1 - y);
            return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
        };

        return {
            header: header,
            data: dataFunction,
            interpolate: interpolateFunction
        };
    }

    /**
     * High-level data request methods for Products to use
     */

    public async getParticleData(date: Date, uParam: string, vParam: string, level: string): Promise<any> {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const dateStr = `${year}${month}${day}`;

        // Build URLs for U and V components
        const uUrl = Grib2Service.buildNomadsUrl({
            model: 'gfs',
            resolution: '0p25',
            date: dateStr,
            cycle: hour,
            forecast: '000',
            parameter: uParam,
            level: level
        });

        const vUrl = Grib2Service.buildNomadsUrl({
            model: 'gfs',
            resolution: '0p25',
            date: dateStr,
            cycle: hour,
            forecast: '000',
            parameter: vParam,
            level: level
        });

        // Fetch both components
        const [uData, vData] = await Promise.all([
            this.fetchGrib2Data(uUrl),
            this.fetchGrib2Data(vUrl)
        ]);

        // Return grid builder ready for Products
        return this.createGridBuilder(uData[0], vData[0]);
    }

    public async getWeatherData(date: Date, parameter: string, level: string): Promise<any> {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const hour = String(date.getUTCHours()).padStart(2, '0');
        const dateStr = `${year}${month}${day}`;

        const url = Grib2Service.buildNomadsUrl({
            model: 'gfs',
            resolution: '0p25',
            date: dateStr,
            cycle: hour,
            forecast: '000',
            parameter: parameter,
            level: level
        });

        const data = await this.fetchGrib2Data(url);
        return this.createScalarGridBuilder(data[0]);
    }
}

// Export the singleton instance
export const grib2Service = Grib2Service.getInstance(); 