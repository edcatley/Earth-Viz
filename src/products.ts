/**
 * products - defines the behavior of weather data grids, including grid construction, interpolation, and color scales.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import * as d3 from 'd3';
import µ from './micro';
import { GridBuilder, Grid, GridHeader } from './types/grid';

export interface Product {
    description: string | ((langCode: string) => any);
    paths: string[];
    date: Date | null;
    navigate: (step: number) => Date;
    load: (cancel: { requested: boolean }) => Promise<any>;
    field?: string;
    type?: string;
    builder: Function;
    units?: Array<{
        label: string;
        conversion: (x: number) => number;
        precision: number;
    }>;
    scale?: {
        bounds: [number, number];
        gradient: Function;
    };
    particles?: {
        velocityScale: number;
        maxIntensity: number;
    };
}

// Helper functions to replace underscore
function matches(source: Record<string, any>): (obj: any) => boolean {
    return function(obj: any) {
        for (const key in source) {
            if (obj[key] !== source[key]) return false;
        }
        return true;
    };
}

function sortedIndex(array: string[], value: string): number {
    let low = 0;
    let high = array.length;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (array[mid] < value) low = mid + 1;
        else high = mid;
    }
    return low;
}

const WEATHER_PATH = "/data/weather";
const OSCAR_PATH = "/data/oscar";

const catalogs = {
    // The OSCAR catalog is an array of file names, sorted and prefixed with yyyyMMdd. Last item is the
    // most recent. For example: [ 20140101-abc.json, 20140106-abc.json, 20140112-abc.json, ... ]
    oscar: µ.loadJson([OSCAR_PATH, "catalog.json"].join("/"))
};

function buildProduct(overrides: Partial<Product>): Product {
    const base = {
        description: "",
        paths: [],
        date: null,
        navigate: function(step: number): Date {
            if (!this.date) throw new Error("Date not set");
            return gfsStep(this.date, step);
        },
        load: function(cancel: { requested: boolean }): Promise<any> {
            const me = this;
            if (!this.builder) throw new Error("Builder not set");
            return Promise.all(this.paths.map(µ.loadJson)).then(function(files: any[]) {
                return cancel.requested ? null : Object.assign(me, buildGrid(Function.prototype.apply.call(me.builder, me, files)));
            });
        },
        builder: function() { throw new Error("Builder not implemented"); }
    };
    return Object.assign(base, overrides);
}

/**
 * @param attr
 * @param {String} type
 * @param {String?} surface
 * @param {String?} level
 * @returns {String}
 */
function gfs1p0degPath(attr: any, type: string, surface?: string, level?: string): string {
    const dir = attr.date;
    const stamp = dir === "current" ? "current" : attr.hour;
    const file = [stamp, type, surface, level, "gfs", "1.0"].filter(µ.isValue).join("-") + ".json";
    return [WEATHER_PATH, dir, file].join("/");
}

function gfsDate(attr: any): Date {
    if (attr.date === "current") {
        // Construct the date from the current time, rounding down to the nearest three-hour block.
        const now = new Date(Date.now());
        const hour = Math.floor(now.getUTCHours() / 3);
        return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour));
    }
    const parts = attr.date.split("/");
    return new Date(Date.UTC(+parts[0], parts[1] - 1, +parts[2], +attr.hour.substr(0, 2)));
}

/**
 * Returns a date for the chronologically next or previous GFS data layer. How far forward or backward in time
 * to jump is determined by the step. Steps of ±1 move in 3-hour jumps, and steps of ±10 move in 24-hour jumps.
 */
function gfsStep(date: Date, step: number): Date {
    const offset = (step > 1 ? 8 : step < -1 ? -8 : step) * 3;
    const adjusted = new Date(date);
    adjusted.setHours(adjusted.getHours() + offset);
    return adjusted;
}

function netcdfHeader(time: any, lat: any, lon: any, center: string): GridHeader {
    return {
        lo1: lon.sequence.start,
        la1: lat.sequence.start,
        dx: lon.sequence.delta,
        dy: -lat.sequence.delta,
        nx: lon.sequence.size,
        ny: lat.sequence.size,
        refTime: time.data[0],
        forecastTime: 0,
        centerName: center
    };
}

function describeSurface(attr: any): string {
    return attr.surface === "surface" ? "Surface" : µ.capitalize(attr.level);
}

function describeSurfaceJa(attr: any): string {
    return attr.surface === "surface" ? "地上" : µ.capitalize(attr.level);
}

/**
 * Returns a function f(langCode) that, given table:
 *     {foo: {en: "A", ja: "あ"}, bar: {en: "I", ja: "い"}}
 * will return the following when called with "en":
 *     {foo: "A", bar: "I"}
 * or when called with "ja":
 *     {foo: "あ", bar: "い"}
 */
function localize(table: any): (langCode: string) => any {
    return function(langCode: string): any {
        const result: any = {};
        Object.entries(table).forEach(([key, value]: [string, any]) => {
            result[key] = value[langCode] || value.en || value;
        });
        return result;
    }
}

function dataSource(header: GridHeader): string {
    // noinspection FallthroughInSwitchStatementJS
    switch (header.center || header.centerName) {
        case -3:
            return "OSCAR / Earth & Space Research";
        case 7:
        case "US National Weather Service, National Centres for Environmental Prediction (NCEP)":
            return "GFS / NCEP / US National Weather Service";
        default:
            return header.centerName || "";
    }
}

/**
 * Builds an interpolator for the specified data in the form of JSON-ified GRIB files. Example:
 *
 *     [
 *       {
 *         "header": {
 *           "refTime": "2013-11-30T18:00:00.000Z",
 *           "parameterCategory": 2,
 *           "parameterNumber": 2,
 *           "surface1Type": 100,
 *           "surface1Value": 100000.0,
 *           "forecastTime": 6,
 *           "scanMode": 0,
 *           "nx": 360,
 *           "ny": 181,
 *           "lo1": 0,
 *           "la1": 90,
 *           "lo2": 359,
 *           "la2": -90,
 *           "dx": 1,
 *           "dy": 1
 *         },
 *         "data": [3.42, 3.31, 3.19, 3.08, 2.96, 2.84, 2.72, 2.6, 2.47, ...]
 *       }
 *     ]
 */
function buildGrid(builder: GridBuilder): Grid {
    const header = builder.header;
    const λ0 = header.lo1, φ0 = header.la1;  // the grid's origin (e.g., 0.0E, 90.0N)
    const Δλ = header.dx, Δφ = header.dy;    // distance between grid points (e.g., 2.5 deg lon, 2.5 deg lat)
    const ni = header.nx, nj = header.ny;    // number of grid points W-E and N-S (e.g., 144 x 73)
    const date = new Date(header.refTime);
    date.setHours(date.getHours() + header.forecastTime);

    // Scan mode 0 assumed. Longitude increases from λ0, and latitude decreases from φ0.
    // http://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_table3-4.shtml
    const grid: any[][] = [];
    let p = 0;
    const isContinuous = Math.floor(ni * Δλ) >= 360;
    
    for (let j = 0; j < nj; j++) {
        const row: any[] = [];
        for (let i = 0; i < ni; i++, p++) {
            row[i] = builder.data(p);
        }
        if (isContinuous) {
            // For wrapped grids, duplicate first column as last column to simplify interpolation logic
            row.push(row[0]);
        }
        grid[j] = row;
    }

    function interpolate(λ: number, φ: number): number | [number, number, number] | null {
        const i = µ.floorMod(λ - λ0, 360) / Δλ;  // calculate longitude index in wrapped range [0, 360)
        const j = (φ0 - φ) / Δφ;                 // calculate latitude index in direction +90 to -90

        //         1      2           After converting λ and φ to fractional grid indexes i and j, we find the
        //        fi  i   ci          four points "G" that enclose point (i, j). These points are at the four
        //         | =1.4 |           corners specified by the floor and ceiling of i and j. For example, given
        //      ---G--|---G--- fj 8   i = 1.4 and j = 8.3, the four surrounding grid points are (1, 8), (2, 8),
        //    j ___|_ .   |           (1, 9) and (2, 9).
        //  =8.3   |      |
        //      ---G------G--- cj 9   Note that for wrapped grids, the first column is duplicated as the last
        //         |      |           column, so the index ci can be used without taking a modulo.

        const fi = Math.floor(i), ci = fi + 1;
        const fj = Math.floor(j), cj = fj + 1;

        let row: any[] | undefined;
        if ((row = grid[fj])) {
            const g00 = row[fi];
            const g10 = row[ci];
            if (µ.isValue(g00) && µ.isValue(g10) && (row = grid[cj])) {
                const g01 = row[fi];
                const g11 = row[ci];
                if (µ.isValue(g01) && µ.isValue(g11)) {
                    // All four points found, so interpolate the value.
                    return builder.interpolate(i - fi, j - fj, g00, g10, g01, g11);
                }
            }
        }
        return null;
    }

    return {
        source: dataSource(header),
        date: date,
        interpolate: interpolate,
        forEachPoint: function(cb: (λ: number, φ: number, value: any) => void): void {
            for (let j = 0; j < nj; j++) {
                const row = grid[j] || [];
                for (let i = 0; i < ni; i++) {
                    cb(µ.floorMod(180 + λ0 + i * Δλ, 360) - 180, φ0 - j * Δφ, row[i]);
                }
            }
        }
    };
}

function bilinearInterpolateScalar(x: number, y: number, g00: number, g10: number, g01: number, g11: number): number {
    const rx = (1 - x);
    const ry = (1 - y);
    return g00 * rx * ry + g10 * x * ry + g01 * rx * y + g11 * x * y;
}

function bilinearInterpolateVector(x: number, y: number, g00: [number, number], g10: [number, number], g01: [number, number], g11: [number, number]): [number, number, number] {
    const rx = (1 - x);
    const ry = (1 - y);
    const a = rx * ry, b = x * ry, c = rx * y, d = x * y;
    const u = g00[0] * a + g10[0] * b + g01[0] * c + g11[0] * d;
    const v = g00[1] * a + g10[1] * b + g01[1] * c + g11[1] * d;
    return [u, v, Math.sqrt(u * u + v * v)];
}

/**
 * Returns the file name for the most recent OSCAR data layer to the specified date. If offset is non-zero,
 * the file name that many entries from the most recent is returned.
 *
 * The result is undefined if there is no entry for the specified date and offset can be found.
 *
 * UNDONE: the catalog object itself should encapsulate this logic. GFS can also be a "virtual" catalog, and
 *         provide a mechanism for eliminating the need for /data/weather/current/* files.
 *
 * @param {Array} catalog array of file names, sorted and prefixed with yyyyMMdd. Last item is most recent.
 * @param {String} date string with format yyyy/MM/dd or "current"
 * @param {Number?} offset
 * @returns {String} file name
 */
function lookupOscar(catalog: string[], date: string, offset?: number): string | undefined {
    const safeOffset = offset || 0;
    if (date === "current") {
        return catalog[catalog.length - 1 + safeOffset];
    }
    const prefix = µ.ymdRedelimit(date, "/", "");
    let i = sortedIndex(catalog, prefix);
    i = (catalog[i] || "").indexOf(prefix) === 0 ? i : i - 1;
    return catalog[i + safeOffset];
}

function oscar0p33Path(catalog: string[], attr: any): string | null {
    const file = lookupOscar(catalog, attr.date);
    return file ? [OSCAR_PATH, file].join("/") : null;
}

function oscarDate(catalog: string[], attr: any): Date | null {
    const file = lookupOscar(catalog, attr.date);
    const parts = file ? µ.ymdRedelimit(file, "", "/").split("/") : null;
    return parts ? new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0)) : null;
}

/**
 * @returns {Date} the chronologically next or previous OSCAR data layer. How far forward or backward in
 * time to jump is determined by the step and the catalog of available layers. A step of ±1 moves to the
 * next/previous entry in the catalog (about 5 days), and a step of ±10 moves to the entry six positions away
 * (about 30 days).
 */
function oscarStep(catalog: string[], date: Date, step: number): Date | null {
    const file = lookupOscar(catalog, µ.dateToUTCymd(date, "/"), step > 1 ? 6 : step < -1 ? -6 : step);
    const parts = file ? µ.ymdRedelimit(file, "", "/").split("/") : null;
    return parts ? new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]), 0)) : null;
}

const FACTORIES = {
    "wind": {
        matches: matches({param: "wind"}),
        create: function(attr: any): Product {
            return buildProduct({
                field: "vector",
                type: "wind",
                description: localize({
                    name: {en: "Wind", ja: "風速"},
                    qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                }),
                paths: [gfs1p0degPath(attr, "wind", attr.surface, attr.level)],
                date: gfsDate(attr),
                builder: function(file: any) {
                    const uData = file[0].data, vData = file[1].data;
                    return {
                        header: file[0].header,
                        interpolate: bilinearInterpolateVector,
                        data: function(i: number) {
                            return [uData[i], vData[i]];
                        }
                    }
                },
                units: [
                    {label: "km/h", conversion: function(x) { return x * 3.6; },      precision: 0},
                    {label: "m/s",  conversion: function(x) { return x; },            precision: 1},
                    {label: "kn",   conversion: function(x) { return x * 1.943844; }, precision: 0},
                    {label: "mph",  conversion: function(x) { return x * 2.236936; }, precision: 0}
                ],
                scale: {
                    bounds: [0, 100],
                    gradient: function(v: number, a: number) {
                        return µ.extendedSinebowColor(Math.min(v, 100) / 100, a);
                    }
                },
                particles: {velocityScale: 1/60000, maxIntensity: 17}
            });
        }
    },

    "temp": {
        matches: matches({param: "wind", overlayType: "temp"}),
        create: function(attr: any): Product {
            return buildProduct({
                field: "scalar",
                type: "temp",
                description: localize({
                    name: {en: "Temp", ja: "気温"},
                    qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                }),
                paths: [gfs1p0degPath(attr, "temp", attr.surface, attr.level)],
                date: gfsDate(attr),
                builder: function(file: any) {
                    const record = file[0], data = record.data;
                    return {
                        header: record.header,
                        interpolate: bilinearInterpolateScalar,
                        data: function(i: number) {
                            return data[i];
                        }
                    }
                },
                units: [
                    {label: "°C", conversion: function(x) { return x - 273.15; },       precision: 1},
                    {label: "°F", conversion: function(x) { return x * 9/5 - 459.67; }, precision: 1},
                    {label: "K",  conversion: function(x) { return x; },                precision: 1}
                ],
                scale: {
                    bounds: [193, 328],
                    gradient: µ.segmentedColorScale([
                        [193,     [37, 4, 42]],
                        [206,     [41, 10, 130]],
                        [219,     [81, 40, 40]],
                        [233.15,  [192, 37, 149]],  // -40 C/F
                        [255.372, [70, 215, 215]],  // 0 F
                        [273.15,  [21, 84, 187]],   // 0 C
                        [275.15,  [24, 132, 14]],   // just above 0 C
                        [291,     [247, 251, 59]],
                        [298,     [235, 167, 21]],
                        [311,     [230, 71, 39]],
                        [328,     [88, 27, 67]]
                    ])
                }
            });
        }
    },

    "relative_humidity": {
        matches: matches({param: "wind", overlayType: "relative_humidity"}),
        create: function(attr: any): Product {
            return buildProduct({
                field: "scalar",
                type: "relative_humidity",
                description: localize({
                    name: {en: "Relative Humidity", ja: "相対湿度"},
                    qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                }),
                paths: [gfs1p0degPath(attr, "relative_humidity", attr.surface, attr.level)],
                date: gfsDate(attr),
                builder: function(file: any) {
                    const vars = file.variables;
                    const rh = vars.Relative_humidity_isobaric || vars.Relative_humidity_height_above_ground;
                    const data = rh.data;
                    return {
                        header: netcdfHeader(vars.time, vars.lat, vars.lon, file.Originating_or_generating_Center),
                        interpolate: bilinearInterpolateScalar,
                        data: function(i: number) {
                            return data[i];
                        }
                    };
                },
                units: [
                    {label: "%", conversion: function(x) { return x; }, precision: 0}
                ],
                scale: {
                    bounds: [0, 100],
                    gradient: function(v: number, a: number) {
                        return µ.sinebowColor(Math.min(v, 100) / 100, a);
                    }
                }
            });
        }
    },

    "air_density": {
        matches: matches({param: "wind", overlayType: "air_density"}),
        create: function(attr: any): Product {
            return buildProduct({
                field: "scalar",
                type: "air_density",
                description: localize({
                    name: {en: "Air Density", ja: "空気密度"},
                    qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                }),
                paths: [gfs1p0degPath(attr, "air_density", attr.surface, attr.level)],
                date: gfsDate(attr),
                builder: function(file: any) {
                    const vars = file.variables;
                    const air_density = vars.air_density, data = air_density.data;
                    return {
                        header: netcdfHeader(vars.time, vars.lat, vars.lon, file.Originating_or_generating_Center),
                        interpolate: bilinearInterpolateScalar,
                        data: function(i: number) {
                            return data[i];
                        }
                    };
                },
                units: [
                    {label: "kg/m³", conversion: function(x) { return x; }, precision: 2}
                ],
                scale: {
                    bounds: [0, 1.5],
                    gradient: function(v: number, a: number) {
                        return µ.sinebowColor(Math.min(v, 1.5) / 1.5, a);
                    }
                }
            });
        }
    },

    "wind_power_density": {
        matches: matches({param: "wind", overlayType: "wind_power_density"}),
        create: function(attr: any): Product {
            const windProduct = FACTORIES.wind.create(attr);
            const airdensProduct = FACTORIES.air_density.create(attr);
            return buildProduct({
                field: "scalar",
                type: "wind_power_density",
                description: localize({
                    name: {en: "Wind Power Density", ja: "風力エネルギー密度"},
                    qualifier: {en: " @ " + describeSurface(attr), ja: " @ " + describeSurfaceJa(attr)}
                }),
                paths: [windProduct.paths[0], airdensProduct.paths[0]],
                date: gfsDate(attr),
                builder: function(windFile: any, airdensFile: any) {
                    const windBuilder = windProduct.builder(windFile);
                    const airdensBuilder = airdensProduct.builder(airdensFile);
                    const windData = windBuilder.data, windInterpolate = windBuilder.interpolate;
                    const airdensData = airdensBuilder.data, airdensInterpolate = airdensBuilder.interpolate;
                    return {
                        header: { ...airdensBuilder.header },
                        interpolate: function(x: number, y: number, g00: any, g10: any, g01: any, g11: any) {
                            const m = windInterpolate(x, y, g00[0], g10[0], g01[0], g11[0])[2];
                            const ρ = airdensInterpolate(x, y, g00[1], g10[1], g01[1], g11[1]);
                            return 0.5 * ρ * m * m * m;
                        },
                        data: function(i: number) {
                            return [windData(i), airdensData(i)];
                        }
                    };
                }
            });
        }
    },

    "total_cloud_water": {
        matches: matches({param: "wind", overlayType: "total_cloud_water"}),
        create: function(attr: any): Product {
            return buildProduct({
                field: "scalar",
                type: "total_cloud_water",
                description: localize({
                    name: {en: "Total Cloud Water", ja: "雲水量"},
                    qualifier: ""
                }),
                paths: [gfs1p0degPath(attr, "total_cloud_water")],
                date: gfsDate(attr),
                builder: function(file: any) {
                    const record = file[0], data = record.data;
                    return {
                        header: record.header,
                        interpolate: bilinearInterpolateScalar,
                        data: function(i: number) {
                            return data[i];
                        }
                    }
                },
                units: [
                    {label: "kg/m²", conversion: function(x) { return x; }, precision: 3}
                ],
                scale: {
                    bounds: [0, 1],
                    gradient: µ.segmentedColorScale([
                        [0.0, [5, 5, 89]],
                        [0.2, [170, 170, 230]],
                        [1.0, [255, 255, 255]]
                    ])
                }
            });
        }
    },

    "total_precipitable_water": {
        matches: matches({param: "wind", overlayType: "total_precipitable_water"}),
        create: function(attr: any): Product {
            return buildProduct({
                field: "scalar",
                type: "total_precipitable_water",
                description: localize({
                    name: {en: "Total Precipitable Water", ja: "可降水量"},
                    qualifier: ""
                }),
                paths: [gfs1p0degPath(attr, "total_precipitable_water")],
                date: gfsDate(attr),
                builder: function(file: any) {
                    const record = file[0], data = record.data;
                    return {
                        header: record.header,
                        interpolate: bilinearInterpolateScalar,
                        data: function(i: number) {
                            return data[i];
                        }
                    }
                },
                units: [
                    {label: "kg/m²", conversion: function(x) { return x; }, precision: 3}
                ],
                scale: {
                    bounds: [0, 70],
                    gradient: µ.segmentedColorScale([
                        [0, [230, 165, 30]],
                        [10, [120, 100, 95]],
                        [20, [40, 44, 92]],
                        [30, [21, 13, 193]],
                        [40, [75, 63, 235]],
                        [60, [25, 255, 255]],
                        [70, [150, 255, 255]]
                    ])
                }
            });
        }
    },

    "mean_sea_level_pressure": {
        matches: matches({param: "wind", overlayType: "mean_sea_level_pressure"}),
        create: function(attr: any): Product {
            return buildProduct({
                field: "scalar",
                type: "mean_sea_level_pressure",
                description: localize({
                    name: {en: "Mean Sea Level Pressure", ja: "海面更正氣圧"},
                    qualifier: ""
                }),
                paths: [gfs1p0degPath(attr, "mean_sea_level_pressure")],
                date: gfsDate(attr),
                builder: function(file: any) {
                    const record = file[0], data = record.data;
                    return {
                        header: record.header,
                        interpolate: bilinearInterpolateScalar,
                        data: function(i: number) {
                            return data[i];
                        }
                    }
                },
                units: [
                    {label: "hPa", conversion: function(x) { return x / 100; }, precision: 0},
                    {label: "mmHg", conversion: function(x) { return x / 133.322387415; }, precision: 0},
                    {label: "inHg", conversion: function(x) { return x / 3386.389; }, precision: 1}
                ],
                scale: {
                    bounds: [92000, 105000],
                    gradient: µ.segmentedColorScale([
                        [92000, [40, 0, 0]],
                        [95000, [187, 60, 31]],
                        [96500, [137, 32, 30]],
                        [98000, [16, 1, 43]],
                        [100500, [36, 1, 93]],
                        [101300, [241, 254, 18]],
                        [103000, [228, 246, 223]],
                        [105000, [255, 255, 255]]
                    ])
                }
            });
        }
    },

    "currents": {
        matches: matches({param: "ocean", surface: "surface", level: "currents"}),
        create: function(attr: any): Promise<Product> {
            return Promise.resolve(catalogs.oscar).then(function(catalog: string[]) {
                const path = oscar0p33Path(catalog, attr);
                if (!path) throw new Error("Could not find OSCAR data path");
                
                const date = oscarDate(catalog, attr);
                if (!date) throw new Error("Could not determine OSCAR data date");

                return buildProduct({
                    field: "vector",
                    type: "currents",
                    description: localize({
                        name: {en: "Ocean Currents", ja: "海流"},
                        qualifier: {en: " @ Surface", ja: " @ 地上"}
                    }),
                    paths: [path],
                    date: date,
                    navigate: function(step: number): Date {
                        const nextDate = oscarStep(catalog, this.date as Date, step);
                        if (!nextDate) throw new Error("Could not navigate to next OSCAR data");
                        return nextDate;
                    },
                    builder: function(file: any) {
                        const uData = file[0].data, vData = file[1].data;
                        return {
                            header: file[0].header,
                            interpolate: bilinearInterpolateVector,
                            data: function(i: number) {
                                const u = uData[i], v = vData[i];
                                return µ.isValue(u) && µ.isValue(v) ? [u, v] : null;
                            }
                        }
                    },
                    units: [
                        {label: "m/s",  conversion: function(x) { return x; },            precision: 2},
                        {label: "km/h", conversion: function(x) { return x * 3.6; },      precision: 1},
                        {label: "kn",   conversion: function(x) { return x * 1.943844; }, precision: 1},
                        {label: "mph",  conversion: function(x) { return x * 2.236936; }, precision: 1}
                    ],
                    scale: {
                        bounds: [0, 1.5],
                        gradient: µ.segmentedColorScale([
                            [0, [10, 25, 68]],
                            [0.15, [10, 25, 250]],
                            [0.4, [24, 255, 93]],
                            [0.65, [255, 233, 102]],
                            [1.0, [255, 233, 15]],
                            [1.5, [255, 15, 15]]
                        ])
                    },
                    particles: {velocityScale: 1/4400, maxIntensity: 0.7}
                });
            });
        }
    },

    "off": {
        matches: matches({overlayType: "off"}),
        create: function(): null {
            return null;
        }
    }
};

function productsFor(attributes: any): (Product | Promise<Product> | null)[] {
    const attr = { ...attributes };
    const results: (Product | Promise<Product> | null)[] = [];
    Object.values(FACTORIES).forEach(function(factory: any) {
        if (factory.matches(attr)) {
            results.push(factory.create(attr));
        }
    });
    return results.filter(µ.isValue);
}

export const products = {
    overlayTypes: ["default", "air_density", "wind_power_density", "temp", "relative_humidity", "off"],
    productsFor
}; 