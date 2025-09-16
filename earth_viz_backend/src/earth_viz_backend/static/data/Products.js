/**
 * Products - Clean separation of particle and overlay configurations
 */
import { Utils } from '../utils/Utils';
import { weatherDataService } from '../services/WeatherDataService';
const PARTICLE_COMPUTATIONS = {
    wave_vector: (direction, period) => {
        // Convert wave direction (degrees) and period (seconds) to movement vector
        const directionRad = direction * (Math.PI / 180);
        const speed = period / 10; // Scale period to reasonable movement speed
        const u = speed * Math.cos(directionRad);
        const v = speed * Math.sin(directionRad);
        return [u, v];
    }
};
const PARTICLE_CONFIGS = {
    wind: {
        type: 'vector',
        parameters: [
            { name: 'UGRD', levelType: 'surface' },
            { name: 'VGRD', levelType: 'surface' }
        ],
        description: "Wind",
        units: [
            { label: "m/s", conversion: (x) => x, precision: 1 },
            { label: "km/h", conversion: (x) => x * 3.6, precision: 0 },
            { label: "kn", conversion: (x) => x * 1.943844, precision: 0 },
            { label: "mph", conversion: (x) => x * 2.236936, precision: 0 }
        ],
        particles: { velocityScale: 1 / 200000, maxIntensity: 17 }
    },
    oceancurrent: {
        type: 'vector',
        parameters: [
            { name: 'UOGRD', levelType: 'surface' }, // Ocean U-component (placeholder)
            { name: 'VOGRD', levelType: 'surface' } // Ocean V-component (placeholder)
        ],
        description: "Ocean Current",
        units: [
            { label: "m/s", conversion: (x) => x, precision: 2 },
            { label: "km/h", conversion: (x) => x * 3.6, precision: 1 },
            { label: "kn", conversion: (x) => x * 1.943844, precision: 1 }
        ],
        particles: { velocityScale: 1 / 300000, maxIntensity: 2 }
    },
    wave: {
        type: 'computed',
        parameters: [
            { name: 'DIRPW', levelType: 'surface' }, // Primary Wave Direction
            { name: 'PERPW', levelType: 'surface' } // Primary Wave Period
        ],
        computation: 'wave_vector',
        description: "Wave Motion",
        units: [
            { label: "m/s", conversion: (x) => x, precision: 2 }
        ],
        particles: { velocityScale: 1 / 20000, maxIntensity: 5, style: 'waves' }
    }
};
const OVERLAY_CONFIGS = {
    // Wind overlay (separate from wind particles)
    wind: {
        type: 'vector',
        parameters: [
            { name: 'UGRD', levelType: 'surface' },
            { name: 'VGRD', levelType: 'surface' }
        ],
        description: "Wind Speed",
        units: [
            { label: "m/s", conversion: (x) => x, precision: 1 },
            { label: "km/h", conversion: (x) => x * 3.6, precision: 0 },
            { label: "kn", conversion: (x) => x * 1.943844, precision: 0 },
            { label: "mph", conversion: (x) => x * 2.236936, precision: 0 }
        ],
        scale: {
            bounds: [0, 100],
            gradient: (v, a) => Utils.extendedSinebowColor(Math.min(v, 100) / 100, a)
        }
    },
    temp: {
        type: 'scalar',
        parameters: [{ name: 'TMP', levelType: 'surface' }],
        description: "Temperature",
        units: [
            { label: "°C", conversion: (x) => x - 273.15, precision: 1 },
            { label: "°F", conversion: (x) => x * 9 / 5 - 459.67, precision: 1 },
            { label: "K", conversion: (x) => x, precision: 1 }
        ],
        scale: {
            bounds: [193, 328],
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
        description: "Relative Humidity",
        units: [{ label: "%", conversion: (x) => x, precision: 1 }],
        scale: {
            bounds: [0, 100],
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
        description: "Mean Sea Level Pressure",
        units: [
            { label: "hPa", conversion: (x) => x / 100, precision: 0 },
            { label: "mb", conversion: (x) => x / 100, precision: 0 },
            { label: "Pa", conversion: (x) => x, precision: 0 }
        ],
        scale: {
            bounds: [95000, 105000],
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
        description: "Total Precipitable Water",
        units: [
            { label: "kg/m²", conversion: (x) => x, precision: 1 },
            { label: "mm", conversion: (x) => x, precision: 1 }
        ],
        scale: {
            bounds: [0, 70],
            gradient: Utils.segmentedColorScale([
                [0, [255, 255, 255]], [5, [193, 193, 255]], [10, [138, 138, 255]],
                [15, [83, 83, 255]], [20, [51, 102, 153]], [25, [51, 153, 102]],
                [30, [153, 204, 51]], [35, [255, 255, 51]], [40, [255, 204, 51]],
                [50, [255, 153, 51]], [60, [255, 102, 51]], [70, [255, 51, 51]]
            ])
        }
    },
    total_cloud_water: {
        type: 'scalar',
        parameters: [{ name: 'CWAT', levelType: 'fixed', fixedLevel: 'entire_atmosphere_(considered_as_a_single_layer)' }],
        description: "Total Cloud Water",
        units: [{ label: "kg/m²", conversion: (x) => x, precision: 2 }],
        scale: {
            bounds: [0, 1],
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
const SURFACE_LEVELS = {
    'UGRD': '10_m_above_ground', 'VGRD': '10_m_above_ground',
    'TMP': '2_m_above_ground', 'RH': '2_m_above_ground',
    'GUST': '10_m_above_ground'
};
const ISOBARIC_LEVELS = {
    '1000hPa': '1000_mb', '925hPa': '925_mb', '850hPa': '850_mb', '700hPa': '700_mb',
    '500hPa': '500_mb', '300hPa': '300_mb', '250hPa': '250_mb', '200hPa': '200_mb',
    '150hPa': '150_mb', '100hPa': '100_mb', '70hPa': '70_mb', '50hPa': '50_mb',
    '30hPa': '30_mb', '20hPa': '20_mb', '10hPa': '10_mb'
};
// =================== UNIFIED DATA MANAGER ===================
class WeatherDataManager {
    // Resolve parameter level based on configuration and user selection
    resolveLevel(param, userLevel) {
        switch (param.levelType) {
            case 'fixed':
                return param.fixedLevel;
            case 'surface':
                // For surface-type parameters, 1000hPa is the trigger to use the specific surface level.
                // Otherwise, use the specified isobaric level.
                if (userLevel === '1000hPa') {
                    return SURFACE_LEVELS[param.name] || '10_m_above_ground';
                }
                return ISOBARIC_LEVELS[userLevel] || '1000_mb'; // Fallback to user's level
            case 'isobaric':
                return ISOBARIC_LEVELS[userLevel] || '1000_mb';
            default:
                return '10_m_above_ground';
        }
    }
    // Fetch a single parameter
    async fetchParameter(param, date, userLevel) {
        const level = this.resolveLevel(param, userLevel);
        const scalarData = await weatherDataService.fetchScalarData(param.name, level, date);
        return weatherDataService.createScalarGridBuilder(scalarData);
    }
    // Fetch wind vector data (special case)
    async fetchWindVector(uParam, vParam, date, userLevel) {
        const level = this.resolveLevel(uParam, userLevel);
        const vectorData = await weatherDataService.fetchVectorData(uParam.name, vParam.name, level, date);
        return weatherDataService.createVectorGridBuilder(vectorData);
    }
    // Build particle grid
    async buildParticleGrid(particleName, date, userLevel) {
        const config = PARTICLE_CONFIGS[particleName];
        if (!config)
            throw new Error(`Unknown particle: ${particleName}`);
        if (config.type === 'vector') {
            const [uParam, vParam] = config.parameters;
            return await this.fetchWindVector(uParam, vParam, date, userLevel);
        }
        if (config.type === 'computed') {
            const dataBuilders = await Promise.all(config.parameters.map(param => this.fetchParameter(param, date, userLevel)));
            const computeFn = PARTICLE_COMPUTATIONS[config.computation];
            if (!computeFn)
                throw new Error(`Unknown particle computation: ${config.computation}`);
            return this.buildVectorFromComputation(dataBuilders, computeFn);
        }
        throw new Error(`Unsupported particle type: ${config.type}`);
    }
    // Build overlay grid  
    async buildOverlayGrid(overlayName, date, userLevel) {
        const config = OVERLAY_CONFIGS[overlayName];
        if (!config)
            throw new Error(`Unknown overlay: ${overlayName}`);
        if (config.type === 'scalar') {
            const param = config.parameters[0];
            return await this.fetchParameter(param, date, userLevel);
        }
        if (config.type === 'vector') {
            const [uParam, vParam] = config.parameters;
            const builder = await this.fetchWindVector(uParam, vParam, date, userLevel);
            // Convert vector to magnitude for overlay
            return {
                header: builder.header,
                data: (index) => {
                    const vec = builder.data(index);
                    if (!vec || !Array.isArray(vec))
                        return null;
                    return Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1]); // magnitude
                },
                interpolate: (x, y, g00, g10, g01, g11) => {
                    const result = builder.interpolate(x, y, g00, g10, g01, g11);
                    if (!result || !Array.isArray(result))
                        return null;
                    return result[2]; // magnitude from [u, v, magnitude]
                }
            };
        }
        throw new Error(`Unsupported overlay type: ${config.type}`);
    }
    // Build vector grid from computation (for particles)
    buildVectorFromComputation(dataBuilders, computeFn) {
        return {
            header: dataBuilders[0].header,
            data: (index) => {
                const values = dataBuilders.map(builder => builder.data(index));
                if (values.some(v => v === null))
                    return null;
                return computeFn(...values);
            },
            interpolate: (x, y, g00, g10, g01, g11) => {
                const paramCount = dataBuilders.length;
                const interpolatedParams = [];
                for (let i = 0; i < paramCount; i++) {
                    const vals00 = Array.isArray(g00) ? g00[i] : g00;
                    const vals10 = Array.isArray(g10) ? g10[i] : g10;
                    const vals01 = Array.isArray(g01) ? g01[i] : g01;
                    const vals11 = Array.isArray(g11) ? g11[i] : g11;
                    interpolatedParams.push(Products.bilinearInterpolateScalar(x, y, vals00, vals10, vals01, vals11));
                }
                const [u, v] = computeFn(...interpolatedParams);
                return [u, v, Math.sqrt(u * u + v * v)]; // [u, v, magnitude]
            }
        };
    }
}
// =================== CLEAN PRODUCTS CLASS ===================
export class Products {
    // Utility functions (kept for compatibility)
    static gfsDate(attr) {
        if (attr.date === "current") {
            const now = new Date(Date.now() - 6 * 60 * 60 * 1000);
            const hour = Math.floor(now.getUTCHours() / 6) * 6;
            return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
        }
        const parts = attr.date.split("/");
        return new Date(Date.UTC(+parts[0], parts[1] - 1, +parts[2], +attr.hour.substr(0, 2)));
    }
    static gfsStep(date, step) {
        const offset = (step > 1 ? 8 : step < -1 ? -8 : step) * 3;
        const adjusted = new Date(date);
        adjusted.setHours(adjusted.getHours() + offset);
        return adjusted;
    }
    static describeLevel(attr) {
        return attr.level || "1000hPa";
    }
    static localize(table) {
        return function (langCode) {
            const result = {};
            Object.entries(table).forEach(([key, value]) => {
                result[key] = value;
            });
            return result;
        };
    }
    // Interpolation functions (kept from original)
    static bilinearInterpolateScalar(x, y, g00, g10, g01, g11) {
        const rx = (1 - x), ry = (1 - y);
        return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
    }
    static bilinearInterpolateVector(x, y, g00, g10, g01, g11) {
        const rx = (1 - x), ry = (1 - y);
        const a = rx * ry, b = x * ry, c = rx * y, d = x * y;
        const u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
        const v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
        return [u, v, Math.sqrt(u * u + v * v)];
    }
    // Grid building (kept from original)
    static buildGrid(builder) {
        const header = builder.header;
        const λ0 = header.lo1, φ0 = header.la1;
        const Δλ = header.dx, Δφ = header.dy;
        const ni = header.nx, nj = header.ny;
        const date = new Date(header.refTime);
        date.setHours(date.getHours() + header.forecastTime);
        const grid = [];
        let p = 0;
        const isContinuous = Math.floor(ni * Δλ) >= 360;
        for (let j = 0; j < nj; j++) {
            const row = [];
            for (let i = 0; i < ni; i++, p++) {
                row[i] = builder.data(p);
            }
            if (isContinuous)
                row.push(row[0]);
            grid[j] = row;
        }
        function interpolate(λ, φ) {
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
            forEachPoint: function (callback) {
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
    static createParticleProduct(particleName, attr) {
        const config = PARTICLE_CONFIGS[particleName];
        if (!config)
            throw new Error(`Unknown particle: ${particleName}`);
        const date = Products.gfsDate(attr);
        const product = {
            description: config.description + " @ " + Products.describeLevel(attr),
            paths: [],
            date: date,
            field: 'vector', // All particles are vector fields
            type: particleName,
            navigate: function (step) {
                return Products.gfsStep(this.date, step);
            },
            load: async function (cancel) {
                if (cancel.requested)
                    return this;
                const builder = await Products.dataManager.buildParticleGrid(particleName, date, attr.level);
                const grid = Products.buildGrid(builder);
                Object.assign(this, grid);
                return this;
            },
            builder: function () { throw new Error("Use load() instead"); },
            units: config.units,
            particles: config.particles
        };
        return product;
    }
    static createOverlayProduct(overlayName, attr) {
        const config = OVERLAY_CONFIGS[overlayName];
        if (!config)
            throw new Error(`Unknown overlay: ${overlayName}`);
        const date = Products.gfsDate(attr);
        const product = {
            description: config.description + " @ " + Products.describeLevel(attr),
            paths: [],
            date: date,
            field: 'scalar', // All overlays are scalar fields
            type: overlayName,
            navigate: function (step) {
                return Products.gfsStep(this.date, step);
            },
            load: async function (cancel) {
                if (cancel.requested)
                    return null;
                const builder = await Products.dataManager.buildOverlayGrid(overlayName, date, attr.level);
                return Object.assign(this, Products.buildGrid(builder));
            },
            builder: function () { throw new Error("Use load() instead"); },
            units: config.units,
            scale: config.scale
        };
        return product;
    }
}
// Separate type lists for different purposes
Object.defineProperty(Products, "particleTypes", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: ["wind", "oceancurrent", "wave"]
});
Object.defineProperty(Products, "overlayTypes", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: ["off", "wind", "temp", "relative_humidity", "mean_sea_level_pressure", "total_precipitable_water", "total_cloud_water"]
});
Object.defineProperty(Products, "dataManager", {
    enumerable: true,
    configurable: true,
    writable: true,
    value: new WeatherDataManager()
});
//# sourceMappingURL=Products.js.map