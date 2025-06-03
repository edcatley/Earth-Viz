/**
 * Products - Clean separation of particle and overlay configurations
 */

import * as d3 from 'd3';
import { Utils } from './utils/Utils';
import { grib2Service } from './services/Grib2Service';

// Core interfaces (kept for compatibility)
export interface GridHeader {
    lo1: number; la1: number; dx: number; dy: number; nx: number; ny: number;
    refTime: string; forecastTime: number; center?: number; centerName?: string;
}

export interface GridBuilder {
    header: GridHeader;
    data: (index: number) => number | [number, number] | null;
    interpolate: (x: number, y: number, g00: any, g10: any, g01: any, g11: any) => number | [number, number, number] | null;
}

export interface Grid {
    source: string; date: Date;
    interpolate: (λ: number, φ: number) => number | [number, number, number] | null;
    forEachPoint: (callback: (λ: number, φ: number, value: any) => void) => void;
}

export interface Product {
    description: string | ((langCode: string) => any);
    paths: string[]; date: Date | null; navigate: (step: number) => Date;
    load: (cancel: { requested: boolean }) => Promise<any>;
    field?: string; type?: string; builder: Function;
    units?: Array<{ label: string; conversion: (x: number) => number; precision: number; }>;
    scale?: { bounds: [number, number]; gradient: Function; };
    particles?: { velocityScale: number; maxIntensity: number; style?: string; };
}

// =================== CLEAN SEPARATED ARCHITECTURE ===================

// Parameter configuration
interface ParameterConfig {
    name: string;              // GRIB2 parameter name (e.g., 'UGRD', 'TMP')
    levelType: 'surface' | 'isobaric' | 'fixed';  // How to resolve the level
    fixedLevel?: string;       // For fixed levels like 'mean_sea_level'
}

// Base configuration for all products
interface BaseProductConfig {
    description: { en: string; ja: string };
    units: Array<{ label: string; conversion: (x: number) => number; precision: number; }>;
}

// =================== PARTICLE CONFIGURATIONS ===================

interface ParticleConfig extends BaseProductConfig {
    type: 'vector' | 'computed';
    parameters: ParameterConfig[];
    computation?: string;  // For computed particles like waves
    particles: { velocityScale: number; maxIntensity: number; style?: string; };
}

// Computation functions for particle data
type ParticleComputationFn = (...values: number[]) => [number, number]; // Always returns [u, v]

const PARTICLE_COMPUTATIONS: { [key: string]: ParticleComputationFn } = {
    wave_vector: (direction: number, period: number): [number, number] => {
        // Convert wave direction (degrees) and period (seconds) to movement vector
        const directionRad = direction * (Math.PI / 180);
        const speed = period / 10; // Scale period to reasonable movement speed
        const u = speed * Math.cos(directionRad);
        const v = speed * Math.sin(directionRad);
        return [u, v];
    }
};

const PARTICLE_CONFIGS: { [key: string]: ParticleConfig } = {
    wind: {
        type: 'vector',
        parameters: [
            { name: 'UGRD', levelType: 'surface' },
            { name: 'VGRD', levelType: 'surface' }
        ],
        description: { en: "Wind", ja: "風" },
        units: [
            { label: "m/s", conversion: (x: number) => x, precision: 1 },
            { label: "km/h", conversion: (x: number) => x * 3.6, precision: 0 },
            { label: "kn", conversion: (x: number) => x * 1.943844, precision: 0 },
            { label: "mph", conversion: (x: number) => x * 2.236936, precision: 0 }
        ],
        particles: { velocityScale: 1/50000, maxIntensity: 17 }
    },

    oceancurrent: {
        type: 'vector',
        parameters: [
            { name: 'UOGRD', levelType: 'surface' }, // Ocean U-component (placeholder)
            { name: 'VOGRD', levelType: 'surface' }  // Ocean V-component (placeholder)
        ],
        description: { en: "Ocean Current", ja: "海流" },
        units: [
            { label: "m/s", conversion: (x: number) => x, precision: 2 },
            { label: "km/h", conversion: (x: number) => x * 3.6, precision: 1 },
            { label: "kn", conversion: (x: number) => x * 1.943844, precision: 1 }
        ],
        particles: { velocityScale: 1/10000, maxIntensity: 2 }
    },

    wave: {
        type: 'computed',
        parameters: [
            { name: 'DIRPW', levelType: 'surface' }, // Primary Wave Direction
            { name: 'PERPW', levelType: 'surface' }  // Primary Wave Period
        ],
        computation: 'wave_vector',
        description: { en: "Wave Motion", ja: "波動" },
        units: [
            { label: "m/s", conversion: (x: number) => x, precision: 2 }
        ],
        particles: { velocityScale: 1/20000, maxIntensity: 5, style: 'waves' }
    }
};

// =================== OVERLAY CONFIGURATIONS ===================

interface OverlayConfig extends BaseProductConfig {
    type: 'scalar' | 'vector' | 'computed';
    parameters: ParameterConfig[];
    computation?: string;  // For computed overlays
    scale: { bounds: [number, number]; gradient: Function; };
}

// Computation functions for overlay data
type OverlayComputationFn = (...values: number[]) => number; // Always returns scalar

const OVERLAY_COMPUTATIONS: { [key: string]: OverlayComputationFn } = {
    air_density: (temp: number, pressure: number) => pressure / (287.058 * temp),
    wind_speed: (u: number, v: number) => Math.sqrt(u * u + v * v),
    wind_power_density: (u: number, v: number, temp: number, pressure: number) => {
        const speed = Math.sqrt(u * u + v * v);
        const density = pressure / (287.058 * temp);
        return 0.5 * density * speed * speed * speed;
    }
};

const OVERLAY_CONFIGS: { [key: string]: OverlayConfig } = {
    // Wind overlay (separate from wind particles)
    wind: {
        type: 'computed',
        parameters: [
            { name: 'UGRD', levelType: 'surface' },
            { name: 'VGRD', levelType: 'surface' }
        ],
        computation: 'wind_speed',
        description: { en: "Wind Speed", ja: "風速" },
        units: [
            { label: "m/s", conversion: (x: number) => x, precision: 1 },
            { label: "km/h", conversion: (x: number) => x * 3.6, precision: 0 },
            { label: "kn", conversion: (x: number) => x * 1.943844, precision: 0 },
            { label: "mph", conversion: (x: number) => x * 2.236936, precision: 0 }
        ],
        scale: {
            bounds: [0, 100] as [number, number],
            gradient: (v: number, a: number) => Utils.extendedSinebowColor(Math.min(v, 100) / 100, a)
        }
    },

    temp: {
        type: 'scalar',
        parameters: [{ name: 'TMP', levelType: 'surface' }],
        description: { en: "Temperature", ja: "気温" },
        units: [
            { label: "°C", conversion: (x: number) => x - 273.15, precision: 1 },
            { label: "°F", conversion: (x: number) => x * 9/5 - 459.67, precision: 1 },
            { label: "K", conversion: (x: number) => x, precision: 1 }
        ],
        scale: {
            bounds: [193, 328] as [number, number],
            gradient: Utils.segmentedColorScale([
                [193, [37, 4, 42]], [206, [41, 10, 130]], [219, [81, 40, 40]],
                [233.15, [192, 37, 149]], [255.372, [70, 215, 215]], [273.15, [21, 84, 187]],
                [275.15, [24, 132, 14]], [291, [247, 251, 59]], [298, [235, 167, 21]],
                [311, [230, 71, 39]], [328, [88, 27, 67]]
            ])
        }
    },

    relative_humidity: {
        type: 'scalar',
        parameters: [{ name: 'RH', levelType: 'surface' }],
        description: { en: "Relative Humidity", ja: "相対湿度" },
        units: [{ label: "%", conversion: (x: number) => x, precision: 1 }],
        scale: {
            bounds: [0, 100] as [number, number],
            gradient: Utils.segmentedColorScale([
                [0, [255, 255, 255]], [10, [193, 193, 193]], [20, [138, 138, 138]],
                [30, [83, 83, 83]], [40, [64, 64, 64]], [50, [51, 102, 153]],
                [60, [51, 153, 102]], [70, [153, 204, 51]], [80, [255, 255, 51]],
                [90, [255, 153, 51]], [100, [255, 51, 51]]
            ])
        }
    },

    mean_sea_level_pressure: {
        type: 'scalar',
        parameters: [{ name: 'PRMSL', levelType: 'fixed', fixedLevel: 'mean_sea_level' }],
        description: { en: "Mean Sea Level Pressure", ja: "平均海面気圧" },
        units: [
            { label: "hPa", conversion: (x: number) => x / 100, precision: 0 },
            { label: "mb", conversion: (x: number) => x / 100, precision: 0 },
            { label: "Pa", conversion: (x: number) => x, precision: 0 }
        ],
        scale: {
            bounds: [95000, 105000] as [number, number],
            gradient: Utils.segmentedColorScale([
                [95000, [3, 4, 94]], [96000, [40, 11, 130]], [97000, [81, 40, 40]],
                [98000, [192, 37, 149]], [99000, [70, 215, 215]], [100000, [21, 84, 187]],
                [101000, [24, 132, 14]], [102000, [247, 251, 59]], [103000, [235, 167, 21]],
                [104000, [230, 71, 39]], [105000, [88, 27, 67]]
            ])
        }
    },

    total_precipitable_water: {
        type: 'scalar',
        parameters: [{ name: 'PWAT', levelType: 'fixed', fixedLevel: 'entire_atmosphere_(considered_as_a_single_layer)' }],
        description: { en: "Total Precipitable Water", ja: "可降水量" },
        units: [
            { label: "kg/m²", conversion: (x: number) => x, precision: 1 },
            { label: "mm", conversion: (x: number) => x, precision: 1 }
        ],
        scale: {
            bounds: [0, 70] as [number, number],
            gradient: Utils.segmentedColorScale([
                [0, [255, 255, 255]], [5, [193, 193, 255]], [10, [138, 138, 255]],
                [15, [83, 83, 255]], [20, [51, 102, 153]], [25, [51, 153, 102]],
                [30, [153, 204, 51]], [35, [255, 255, 51]], [40, [255, 204, 51]],
                [50, [255, 153, 51]], [60, [255, 102, 51]], [70, [255, 51, 51]]
            ])
        }
    },

    air_density: {
        type: 'computed',
        parameters: [
            { name: 'TMP', levelType: 'surface' },
            { name: 'PRMSL', levelType: 'fixed', fixedLevel: 'mean_sea_level' }
        ],
        computation: 'air_density',
        description: { en: "Air Density", ja: "空気密度" },
        units: [{ label: "kg/m³", conversion: (x: number) => x, precision: 2 }],
        scale: {
            bounds: [0, 1.5] as [number, number],
            gradient: (v: number, a: number) => Utils.sinebowColor(Math.min(v, 1.5) / 1.5, a)
        }
    },

    wind_power_density: {
        type: 'computed',
        parameters: [
            { name: 'UGRD', levelType: 'surface' },
            { name: 'VGRD', levelType: 'surface' },
            { name: 'TMP', levelType: 'fixed', fixedLevel: '2_m_above_ground' },
            { name: 'PRMSL', levelType: 'fixed', fixedLevel: 'mean_sea_level' }
        ],
        computation: 'wind_power_density',
        description: { en: "Wind Power Density", ja: "風力エネルギー密度" },
        units: [{ label: "W/m²", conversion: (x: number) => x, precision: 1 }],
        scale: {
            bounds: [0, 1000] as [number, number],
            gradient: (v: number, a: number) => Utils.sinebowColor(Math.min(v, 1000) / 1000, a)
        }
    },

    total_cloud_water: {
        type: 'scalar',
        parameters: [{ name: 'CWAT', levelType: 'fixed', fixedLevel: 'entire_atmosphere_(considered_as_a_single_layer)' }],
        description: { en: "Total Cloud Water", ja: "全雲水量" },
        units: [{ label: "kg/m²", conversion: (x: number) => x, precision: 2 }],
        scale: {
            bounds: [0, 1] as [number, number],
            gradient: Utils.segmentedColorScale([
                [0, [255, 255, 255]], [0.1, [193, 193, 255]], [0.2, [138, 138, 255]],
                [0.3, [83, 83, 255]], [0.4, [51, 102, 153]], [0.5, [51, 153, 102]],
                [0.6, [153, 204, 51]], [0.7, [255, 255, 51]], [0.8, [255, 153, 51]],
                [0.9, [255, 102, 51]], [1.0, [255, 51, 51]]
            ])
        }
    }
};

// =================== LEVEL RESOLUTION ===================

const SURFACE_LEVELS: { [param: string]: string } = {
    'UGRD': '10_m_above_ground', 'VGRD': '10_m_above_ground',
    'TMP': '2_m_above_ground', 'RH': '2_m_above_ground',
    'GUST': '10_m_above_ground'
};

const ISOBARIC_LEVELS: { [level: string]: string } = {
    '1000hPa': '1000_mb', '925hPa': '925_mb', '850hPa': '850_mb', '700hPa': '700_mb',
    '500hPa': '500_mb', '300hPa': '300_mb', '250hPa': '250_mb', '200hPa': '200_mb',
    '150hPa': '150_mb', '100hPa': '100_mb', '70hPa': '70_mb', '50hPa': '50_mb',
    '30hPa': '30_mb', '20hPa': '20_mb', '10hPa': '10_mb'
};

// =================== UNIFIED DATA MANAGER ===================

class WeatherDataManager {
    // Resolve parameter level based on configuration and user selection
    private resolveLevel(param: ParameterConfig, userSurface: string, userLevel: string): string {
        switch (param.levelType) {
            case 'fixed':
                return param.fixedLevel!;
            case 'surface':
                if (userSurface === 'surface') {
                    return SURFACE_LEVELS[param.name] || '10_m_above_ground';
                } else if (userSurface === 'isobaric') {
                    return ISOBARIC_LEVELS[userLevel] || '1000_mb';
                }
                return SURFACE_LEVELS[param.name] || '10_m_above_ground';
            case 'isobaric':
                return ISOBARIC_LEVELS[userLevel] || '1000_mb';
            default:
                return '10_m_above_ground';
        }
    }

    // Fetch a single parameter
    private async fetchParameter(param: ParameterConfig, date: Date, userSurface: string, userLevel: string): Promise<GridBuilder> {
        const level = this.resolveLevel(param, userSurface, userLevel);
        return await grib2Service.getWeatherData(date, param.name, level);
    }

    // Fetch wind vector data (special case)
    private async fetchWindVector(uParam: ParameterConfig, vParam: ParameterConfig, date: Date, userSurface: string, userLevel: string): Promise<GridBuilder> {
        const level = this.resolveLevel(uParam, userSurface, userLevel);
        return await grib2Service.getParticleData(date, uParam.name, vParam.name, level);
    }

    // Build particle grid
    async buildParticleGrid(particleName: string, date: Date, userSurface: string, userLevel: string): Promise<GridBuilder> {
        const config = PARTICLE_CONFIGS[particleName];
        if (!config) throw new Error(`Unknown particle: ${particleName}`);

        if (config.type === 'vector') {
            // Direct vector particles (wind, ocean current)
            const [uParam, vParam] = config.parameters;
            return await this.fetchWindVector(uParam, vParam, date, userSurface, userLevel);
        }

        if (config.type === 'computed') {
            // Computed vector particles (waves)
            const dataBuilders = await Promise.all(
                config.parameters.map(param => this.fetchParameter(param, date, userSurface, userLevel))
            );

            const computeFn = PARTICLE_COMPUTATIONS[config.computation!];
            if (!computeFn) throw new Error(`Unknown particle computation: ${config.computation}`);

            return this.buildVectorFromComputation(dataBuilders, computeFn);
        }

        throw new Error(`Unsupported particle type: ${config.type}`);
    }

    // Build overlay grid  
    async buildOverlayGrid(overlayName: string, date: Date, userSurface: string, userLevel: string): Promise<GridBuilder> {
        const config = OVERLAY_CONFIGS[overlayName];
        if (!config) throw new Error(`Unknown overlay: ${overlayName}`);

        if (config.type === 'scalar') {
            // Simple scalar overlays
            const param = config.parameters[0];
            return await this.fetchParameter(param, date, userSurface, userLevel);
        }

        if (config.type === 'vector') {
            // Vector magnitude overlays (wind speed)
            const [uParam, vParam] = config.parameters;
            const builder = await this.fetchWindVector(uParam, vParam, date, userSurface, userLevel);
            
            // Convert vector to magnitude for overlay
            return {
                header: builder.header,
                data: (index: number) => {
                    const vec = builder.data(index);
                    if (!vec || !Array.isArray(vec)) return null;
                    return Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1]); // magnitude
                },
                interpolate: (x: number, y: number, g00: any, g10: any, g01: any, g11: any) => {
                    const result = builder.interpolate(x, y, g00, g10, g01, g11);
                    if (!result || !Array.isArray(result)) return null;
                    return result[2]; // magnitude from [u, v, magnitude]
                }
            };
        }

        if (config.type === 'computed') {
            // Computed scalar overlays
            const dataBuilders = await Promise.all(
                config.parameters.map(param => this.fetchParameter(param, date, userSurface, userLevel))
            );

            const computeFn = OVERLAY_COMPUTATIONS[config.computation!];
            if (!computeFn) throw new Error(`Unknown overlay computation: ${config.computation}`);

            return this.buildScalarFromComputation(dataBuilders, computeFn);
        }

        throw new Error(`Unsupported overlay type: ${config.type}`);
    }

    // Build vector grid from computation (for particles)
    private buildVectorFromComputation(dataBuilders: GridBuilder[], computeFn: ParticleComputationFn): GridBuilder {
        return {
            header: dataBuilders[0].header,
            data: (index: number) => {
                const values = dataBuilders.map(builder => builder.data(index));
                if (values.some(v => v === null)) return null;
                return computeFn(...values as number[]);
            },
            interpolate: (x: number, y: number, g00: any, g10: any, g01: any, g11: any) => {
                const paramCount = dataBuilders.length;
                const interpolatedParams: number[] = [];
                
                for (let i = 0; i < paramCount; i++) {
                    const vals00 = Array.isArray(g00) ? g00[i] : g00;
                    const vals10 = Array.isArray(g10) ? g10[i] : g10;
                    const vals01 = Array.isArray(g01) ? g01[i] : g01;
                    const vals11 = Array.isArray(g11) ? g11[i] : g11;
                    
                    interpolatedParams.push(
                        Products.bilinearInterpolateScalar(x, y, vals00, vals10, vals01, vals11)
                    );
                }

                const [u, v] = computeFn(...interpolatedParams);
                return [u, v, Math.sqrt(u * u + v * v)]; // [u, v, magnitude]
            }
        };
    }

    // Build scalar grid from computation (for overlays)
    private buildScalarFromComputation(dataBuilders: GridBuilder[], computeFn: OverlayComputationFn): GridBuilder {
        return {
            header: dataBuilders[0].header,
            data: (index: number) => {
                const values = dataBuilders.map(builder => builder.data(index));
                if (values.some(v => v === null)) return null;
                return values as any; // Return array for interpolation
            },
            interpolate: (x: number, y: number, g00: any, g10: any, g01: any, g11: any) => {
                const vals00 = Array.isArray(g00) ? g00 : [g00];
                const vals10 = Array.isArray(g10) ? g10 : [g10];
                const vals01 = Array.isArray(g01) ? g01 : [g01];
                const vals11 = Array.isArray(g11) ? g11 : [g11];

                const interpolated = vals00.map((_, i) => 
                    Products.bilinearInterpolateScalar(x, y, vals00[i], vals10[i], vals01[i], vals11[i])
                );

                return computeFn(...interpolated);
            }
        };
    }
}

// =================== CLEAN PRODUCTS CLASS ===================

export class Products {
    // Separate type lists for different purposes
    static readonly particleTypes = ["wind", "oceancurrent", "wave"];
    static readonly overlayTypes = ["off", "wind", "temp", "relative_humidity", "mean_sea_level_pressure", "total_precipitable_water", "air_density", "wind_power_density", "total_cloud_water"];

    private static dataManager = new WeatherDataManager();

    // Utility functions (kept for compatibility)
    private static gfsDate(attr: any): Date {
        if (attr.date === "current") {
            const now = new Date(Date.now() - 6 * 60 * 60 * 1000);
            const hour = Math.floor(now.getUTCHours() / 6) * 6;
            return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
        }
        const parts = attr.date.split("/");
        return new Date(Date.UTC(+parts[0], parts[1] - 1, +parts[2], +attr.hour.substr(0, 2)));
    }

    private static gfsStep(date: Date, step: number): Date {
        const offset = (step > 1 ? 8 : step < -1 ? -8 : step) * 3;
        const adjusted = new Date(date);
        adjusted.setHours(adjusted.getHours() + offset);
        return adjusted;
    }

    private static describeSurface(attr: any): string {
        if (attr.surface === "surface") return "Surface";
        if (attr.surface === "isobaric") return attr.level || "1000hPa";
        return "Surface";
    }

    private static localize(table: any): (langCode: string) => any {
        return function(langCode: string): any {
            const result: any = {};
            Object.entries(table).forEach(([key, value]: [string, any]) => {
                result[key] = value[langCode] || value.en || value;
            });
            return result;
        }
    }

    // Interpolation functions (kept from original)
    static bilinearInterpolateScalar(x: number, y: number, g00: number, g10: number, g01: number, g11: number): number {
        const rx = (1 - x), ry = (1 - y);
        return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
    }

    static bilinearInterpolateVector(x: number, y: number, g00: [number, number], g10: [number, number], g01: [number, number], g11: [number, number]): [number, number, number] {
        const rx = (1 - x), ry = (1 - y);
        const a = rx * ry, b = x * ry, c = rx * y, d = x * y;
        const u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        const v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        return [u, v, Math.sqrt(u * u + v * v)];
    }

    // Grid building (kept from original)
    private static buildGrid(builder: GridBuilder): Grid {
        const header = builder.header;
        const λ0 = header.lo1, φ0 = header.la1;
        const Δλ = header.dx, Δφ = header.dy;
        const ni = header.nx, nj = header.ny;
        const date = new Date(header.refTime);
        date.setHours(date.getHours() + header.forecastTime);

        const grid: any[][] = [];
        let p = 0;
        const isContinuous = Math.floor(ni * Δλ) >= 360;

        for (let j = 0; j < nj; j++) {
            const row: any[] = [];
            for (let i = 0; i < ni; i++, p++) {
                row[i] = builder.data(p);
            }
            if (isContinuous) row.push(row[0]);
            grid[j] = row;
        }

        function interpolate(λ: number, φ: number): number | [number, number, number] | null {
            const i = Utils.floorMod(λ - λ0, 360) / Δλ;
            const j = (φ0 - φ) / Δφ;
            const fi = Math.floor(i), ci = fi + 1;
            const fj = Math.floor(j), cj = fj + 1;

            let row;
            if ((row = grid[fj])) {
                const g00 = row[fi], g10 = row[ci];
                if (g00 != null && g10 != null && (row = grid[cj])) {
                    const g01 = row[fi], g11 = row[ci];
                    if (g01 != null && g11 != null) {
                        return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
                    }
                }
            }
            return null;
        }

        return {
            source: "GFS / NCEP / US National Weather Service",
            date: date,
            interpolate: interpolate,
            forEachPoint: function(callback: (λ: number, φ: number, value: any) => void) {
                for (let j = 0; j < nj; j++) {
                    const row = grid[j] || [];
                    for (let i = 0; i < ni; i++) {
                        callback(λ0 + i * Δλ, φ0 - j * Δφ, row[i]);
                    }
                }
            }
        };
    }

    // SEPARATED PRODUCT CREATION - clean separation of concerns
    static createParticleProduct(particleName: string, attr: any): Product {
        const config = PARTICLE_CONFIGS[particleName];
        if (!config) throw new Error(`Unknown particle: ${particleName}`);

        const date = Products.gfsDate(attr);
        
        const product: Product = {
            description: Products.localize({
                name: config.description,
                qualifier: { en: " @ " + Products.describeSurface(attr), ja: " @ " + Products.describeSurface(attr) }
            }),
            paths: [],
            date: date,
            field: 'vector', // All particles are vector fields
            type: particleName,
            navigate: function(step: number): Date {
                return Products.gfsStep(this.date!, step);
            },
            load: async function(cancel: { requested: boolean }): Promise<any> {
                if (cancel.requested) return null;
                const builder = await Products.dataManager.buildParticleGrid(particleName, date, attr.surface, attr.level);
                return Object.assign(this, Products.buildGrid(builder));
            },
            builder: function() { throw new Error("Use load() instead"); },
            units: config.units,
            particles: config.particles
        };

        return product;
    }

    static createOverlayProduct(overlayName: string, attr: any): Product {
        const config = OVERLAY_CONFIGS[overlayName];
        if (!config) throw new Error(`Unknown overlay: ${overlayName}`);

        const date = Products.gfsDate(attr);
        
        const product: Product = {
            description: Products.localize({
                name: config.description,
                qualifier: { en: " @ " + Products.describeSurface(attr), ja: " @ " + Products.describeSurface(attr) }
            }),
            paths: [],
            date: date,
            field: 'scalar', // All overlays are scalar fields
            type: overlayName,
            navigate: function(step: number): Date {
                return Products.gfsStep(this.date!, step);
            },
            load: async function(cancel: { requested: boolean }): Promise<any> {
                if (cancel.requested) return null;
                const builder = await Products.dataManager.buildOverlayGrid(overlayName, date, attr.surface, attr.level);
                return Object.assign(this, Products.buildGrid(builder));
            },
            builder: function() { throw new Error("Use load() instead"); },
            units: config.units,
            scale: config.scale
        };

        return product;
    }
} 