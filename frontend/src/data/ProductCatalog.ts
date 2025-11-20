/**
 * ProductCatalog - Clean configuration for all weather products
 * 
 * This replaces the messy PARTICLE_CONFIGS and OVERLAY_CONFIGS
 * with a simple, readable catalog of available products.
 */

import { Utils } from '../utils/Utils';
import { WeatherProductConfig } from './WeatherProduct';

// =================== LEVEL MAPPINGS ===================

export const SURFACE_LEVELS: { [param: string]: string } = {
    'UGRD': '10_m_above_ground',
    'VGRD': '10_m_above_ground',
    'TMP': '2_m_above_ground',
    'RH': '2_m_above_ground',
    'GUST': '10_m_above_ground'
};

export const ISOBARIC_LEVELS: { [level: string]: string } = {
    '1000hPa': '1000_mb',
    '925hPa': '925_mb',
    '850hPa': '850_mb',
    '700hPa': '700_mb',
    '500hPa': '500_mb',
    '300hPa': '300_mb',
    '250hPa': '250_mb',
    '200hPa': '200_mb',
    '150hPa': '150_mb',
    '100hPa': '100_mb',
    '70hPa': '70_mb',
    '50hPa': '50_mb',
    '30hPa': '30_mb',
    '20hPa': '20_mb',
    '10hPa': '10_mb'
};

/**
 * Resolve the actual level string for OpenDAP based on user selection
 */
export function resolveLevel(paramName: string, userLevel: string): string {
    // If user selected surface (1000hPa), use the parameter-specific surface level
    if (userLevel === '1000hPa') {
        return SURFACE_LEVELS[paramName] || '10_m_above_ground';
    }
    
    // Otherwise use the isobaric level
    return ISOBARIC_LEVELS[userLevel] || '1000_mb';
}

// =================== PARTICLE PRODUCTS ===================

export const PARTICLE_PRODUCTS = {
    wind: {
        name: 'wind',
        description: 'Wind',
        type: 'vector' as const,
        parameters: ['UGRD', 'VGRD'],
        units: [
            { label: "m/s", conversion: (x: number) => x, precision: 1 },
            { label: "km/h", conversion: (x: number) => x * 3.6, precision: 0 },
            { label: "kn", conversion: (x: number) => x * 1.943844, precision: 0 },
            { label: "mph", conversion: (x: number) => x * 2.236936, precision: 0 }
        ],
        particles: {
            velocityScale: 1 / 100000,
            maxIntensity: 17
        }
    },
    
    oceancurrent: {
        name: 'oceancurrent',
        description: 'Ocean Current',
        type: 'vector' as const,
        parameters: ['UOGRD', 'VOGRD'],
        units: [
            { label: "m/s", conversion: (x: number) => x, precision: 2 },
            { label: "km/h", conversion: (x: number) => x * 3.6, precision: 1 },
            { label: "kn", conversion: (x: number) => x * 1.943844, precision: 1 }
        ],
        particles: {
            velocityScale: 1 / 300000,
            maxIntensity: 2
        }
    }
};

// =================== OVERLAY PRODUCTS ===================

export const OVERLAY_PRODUCTS = {
    wind: {
        name: 'wind',
        description: 'Wind Speed',
        type: 'vector' as const,
        parameters: ['UGRD', 'VGRD'],
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
        name: 'temp',
        description: 'Temperature',
        type: 'scalar' as const,
        parameters: ['TMP'],
        units: [
            { label: "°C", conversion: (x: number) => x - 273.15, precision: 1 },
            { label: "°F", conversion: (x: number) => x * 9 / 5 - 459.67, precision: 1 },
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
        name: 'relative_humidity',
        description: 'Relative Humidity',
        type: 'scalar' as const,
        parameters: ['RH'],
        units: [
            { label: "%", conversion: (x: number) => x, precision: 1 }
        ],
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
        name: 'mean_sea_level_pressure',
        description: 'Mean Sea Level Pressure',
        type: 'scalar' as const,
        parameters: ['PRMSL'],
        levelOverride: 'mean_sea_level',  // Fixed level, ignore user selection
        units: [
            { label: "hPa", conversion: (x: number) => x, precision: 0 },
            { label: "mb", conversion: (x: number) => x, precision: 0 },
            { label: "Pa", conversion: (x: number) => x * 100, precision: 0 }
        ],
        scale: {
            bounds: [950, 1050] as [number, number],
            gradient: Utils.segmentedColorScale([
                [950, [3, 4, 94]], [960, [40, 11, 130]], [970, [81, 40, 40]],
                [980, [192, 37, 149]], [990, [70, 215, 215]], [1000, [21, 84, 187]],
                [1010, [24, 132, 14]], [1020, [247, 251, 59]], [1030, [235, 167, 21]],
                [1040, [230, 71, 39]], [1050, [88, 27, 67]]
            ])
        }
    },
    
    total_precipitable_water: {
        name: 'total_precipitable_water',
        description: 'Total Precipitable Water',
        type: 'scalar' as const,
        parameters: ['PWAT'],
        levelOverride: 'entire_atmosphere_(considered_as_a_single_layer)',
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
    
    total_cloud_water: {
        name: 'total_cloud_water',
        description: 'Total Cloud Water',
        type: 'scalar' as const,
        parameters: ['CWAT'],
        levelOverride: 'entire_atmosphere_(considered_as_a_single_layer)',
        units: [
            { label: "kg/m²", conversion: (x: number) => x, precision: 2 }
        ],
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

// =================== HELPER FUNCTIONS ===================

/**
 * Build a complete product config from catalog entry
 */
export function buildProductConfig(
    catalogEntry: any,
    userLevel: string,
    date: Date
): WeatherProductConfig {
    // Determine the actual level to use
    let level: string;
    if (catalogEntry.levelOverride) {
        // Fixed level (e.g., mean sea level, entire atmosphere)
        level = catalogEntry.levelOverride;
    } else {
        // Resolve based on parameter and user selection
        level = resolveLevel(catalogEntry.parameters[0], userLevel);
    }
    
    return {
        name: catalogEntry.name,
        description: `${catalogEntry.description} @ ${userLevel}`,
        type: catalogEntry.type,
        parameters: catalogEntry.parameters,
        level,
        date,
        units: catalogEntry.units,
        scale: catalogEntry.scale,
        particles: catalogEntry.particles
    };
}

/**
 * Get particle product config
 */
export function getParticleConfig(name: string, userLevel: string, date: Date): WeatherProductConfig {
    const catalogEntry = PARTICLE_PRODUCTS[name as keyof typeof PARTICLE_PRODUCTS];
    if (!catalogEntry) {
        throw new Error(`Unknown particle product: ${name}`);
    }
    return buildProductConfig(catalogEntry, userLevel, date);
}

/**
 * Get overlay product config
 */
export function getOverlayConfig(name: string, userLevel: string, date: Date): WeatherProductConfig {
    const catalogEntry = OVERLAY_PRODUCTS[name as keyof typeof OVERLAY_PRODUCTS];
    if (!catalogEntry) {
        throw new Error(`Unknown overlay product: ${name}`);
    }
    return buildProductConfig(catalogEntry, userLevel, date);
}

// =================== PRODUCT LISTS ===================

export const PARTICLE_TYPES = Object.keys(PARTICLE_PRODUCTS);
export const OVERLAY_TYPES = ['off', ...Object.keys(OVERLAY_PRODUCTS)];
