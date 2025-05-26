/**
 * micro - a grab bag of somewhat useful utility functions and other stuff that requires unit testing
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */

import * as d3 from 'd3';
import { Point, GeoPoint, Logger, DateConfig, ViewportSize, RGB, RGBA } from './types/types';

declare global {
    var µ: any;  // Tell TypeScript that µ exists globally
}

// Create the global µ object with all our functions
window.µ = {
    // Modern replacements - these are now just direct native calls
    isTruthy: (x: any) => !!x,
    isValue: (x: any) => x != null,
    coalesce: <T>(a: T | null | undefined, b: T) => a ?? b,
    zeroPad: (n: number, width: number) => n.toString().padStart(width, '0'),
    capitalize: (s: string) => s.charAt(0).toUpperCase() + s.slice(1),
    removeChildren: (element: Element) => element.replaceChildren(),

    // Add other functions as needed...
};

export {}; // Make this a module

const µ = (function() {
    "use strict";

    const τ = 2 * Math.PI;
    const H = 0.0000360;  // 0.0000360°φ ~= 4m
    const DEFAULT_CONFIG = "current/wind/surface/level/orthographic";
    const TOPOLOGY = isMobile() ? "/data/earth-topo-mobile.json?v2" : "/data/earth-topo.json?v2";

    /**
     * @returns {Number} returns remainder of floored division, i.e., floor(a / n). Useful for consistent modulo
     *          of negative numbers. See http://en.wikipedia.org/wiki/Modulo_operation.
     */
    function floorMod(a: number, n: number): number {
        const f = a - n * Math.floor(a / n);
        // HACK: when a is extremely close to an n transition, f can be equal to n. This is bad because f must be
        //       within range [0, n). Check for this corner case. Example: a:=-1e-16, n:=10.
        return f === n ? 0 : f;
    }

    /**
     * @returns {Number} distance between two points having the form [x, y].
     */
    function distance(a: Point, b: Point): number {
        const Δx = b[0] - a[0];
        const Δy = b[1] - a[1];
        return Math.sqrt(Δx * Δx + Δy * Δy);
    }

    /**
     * @returns {Number} the value x clamped to the range [low, high].
     */
    function clamp(x: number, low: number, high: number): number {
        return Math.max(low, Math.min(x, high));
    }

    /**
     * @returns {number} the fraction of the bounds [low, high] covered by the value x, after clamping x to the
     *          bounds. For example, given bounds=[10, 20], this method returns 1 for x>=20, 0.5 for x=15 and 0
     *          for x<=10.
     */
    function proportion(x: number, low: number, high: number): number {
        return (clamp(x, low, high) - low) / (high - low);
    }

    /**
     * @returns {number} the value p within the range [0, 1], scaled to the range [low, high].
     */
    function spread(p: number, low: number, high: number): number {
        return p * (high - low) + low;
    }

    /**
     * @returns {Boolean} true if agent is probably firefox. Don't really care if this is accurate.
     */
    function isFF(): boolean {
        return (/firefox/i).test(navigator.userAgent);
    }

    /**
     * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
     */
    function isMobile(): boolean {
        return (/android|blackberry|iemobile|ipad|iphone|ipod|opera mini|webos/i).test(navigator.userAgent);
    }

    function isEmbeddedInIFrame(): boolean {
        return window != window.top;
    }

    function toUTCISO(date: Date): string {
        return date.getUTCFullYear() + "-" +
            date.getUTCMonth().toString().padStart(2, '0') + "-" +
            date.getUTCDate().toString().padStart(2, '0') + " " +
            date.getUTCHours().toString().padStart(2, '0') + ":00";
    }

    function toLocalISO(date: Date): string {
        return date.getFullYear() + "-" +
            (date.getMonth() + 1).toString().padStart(2, '0') + "-" +
            date.getDate().toString().padStart(2, '0') + " " +
            date.getHours().toString().padStart(2, '0') + ":00";
    }

    /**
     * @returns {String} the string yyyyfmmfdd as yyyytmmtdd, where f and t are the "from" and "to" delimiters. Either
     *          delimiter may be the empty string.
     */
    function ymdRedelimit(ymd: string, fromDelimiter: string, toDelimiter: string): string {
        if (!fromDelimiter) {
            return ymd.substr(0, 4) + toDelimiter + ymd.substr(4, 2) + toDelimiter + ymd.substr(6, 2);
        }
        const parts = ymd.substr(0, 10).split(fromDelimiter);
        return [parts[0], parts[1], parts[2]].join(toDelimiter);
    }

    /**
     * @returns {String} the UTC year, month, and day of the specified date in yyyyfmmfdd format, where f is the
     *          delimiter (and may be the empty string).
     */
    function dateToUTCymd(date: Date, delimiter: string = ""): string {
        return ymdRedelimit(date.toISOString(), "-", delimiter);
    }

    function dateToConfig(date: Date): DateConfig {
        return {
            date: dateToUTCymd(date, "/"),
            hour: date.getUTCHours().toString().padStart(2, '0') + "00"
        };
    }

    /**
     * @returns {Object} an object to perform logging, if/when the browser supports it.
     */
    function log(): Logger {
        function format(o: unknown): string {
            return o && (o as Error).stack ? `${o}\n${(o as Error).stack}` : String(o);
        }
        return {
            debug: (s: unknown) => console?.log?.(format(s)),
            info: (s: unknown) => console?.info?.(format(s)),
            error: (e: unknown) => console?.error?.(format(e)),
            time: (s: unknown) => console?.time?.(format(s)),
            timeEnd: (s: unknown) => console?.timeEnd?.(format(s))
        };
    }

    /**
     * @returns {width: (Number), height: (Number)} an object that describes the size of the browser's current view.
     */
    function view(): ViewportSize {
        const w = window;
        const d = document && document.documentElement;
        const b = document && document.body;
        const x = w.innerWidth || (d && d.clientWidth) || (b && b.clientWidth) || 1024;
        const y = w.innerHeight || (d && d.clientHeight) || (b && b.clientHeight) || 768;
        return {width: x, height: y};
    }

    /**
     * @returns {Object} clears and returns the specified Canvas element's 2d context.
     */
    function clearCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
        const ctx = canvas.getContext("2d");
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return ctx;
    }

    /**
     * Creates a color interpolator between two colors.
     */
    function colorInterpolator(start: RGB, end: RGB): (i: number, a: number) => RGBA {
        const r = start[0], g = start[1], b = start[2];
        const Δr = end[0] - r, Δg = end[1] - g, Δb = end[2] - b;
        return function(i: number, a: number): RGBA {
            return [Math.floor(r + i * Δr), Math.floor(g + i * Δg), Math.floor(b + i * Δb), a];
        };
    }

    /**
     * Produces a color style in a rainbow-like trefoil color space. Not quite HSV, but produces a nice
     * spectrum. See http://krazydad.com/tutorials/makecolors.php.
     *
     * @param hue the hue rotation in the range [0, 1]
     * @param a the alpha value in the range [0, 255]
     * @returns {Array} [r, g, b, a]
     */
    function sinebowColor(hue: number, a: number): RGBA {
        // Map hue [0, 1] to radians [0, 5/6τ]. Don't allow a full rotation because that keeps hue == 0 and
        // hue == 1 from mapping to the same color.
        let rad = hue * τ * 5/6;
        rad *= 0.75;  // increase frequency to 2/3 cycle per rad

        const s = Math.sin(rad);
        const c = Math.cos(rad);
        const r = Math.floor(Math.max(0, -c) * 255);
        const g = Math.floor(Math.max(s, 0) * 255);
        const b = Math.floor(Math.max(c, 0, -s) * 255);
        return [r, g, b, a];
    }

    const BOUNDARY = 0.45;
    const fadeToWhite = colorInterpolator([...sinebowColor(1.0, 0).slice(0, 3)] as RGB, [255, 255, 255]);

    /**
     * Interpolates a sinebow color where 0 <= i <= j, then fades to white where j < i <= 1.
     *
     * @param i number in the range [0, 1]
     * @param a alpha value in range [0, 255]
     * @returns {Array} [r, g, b, a]
     */
    function extendedSinebowColor(i: number, a: number): RGBA {
        return i <= BOUNDARY ?
            sinebowColor(i / BOUNDARY, a) :
            fadeToWhite((i - BOUNDARY) / (1 - BOUNDARY), a);
    }

    function asColorStyle(r: number, g: number, b: number, a: number): string {
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }

    /**
     * @returns {Array} of wind colors and a method, indexFor, that maps wind magnitude to an index on the color scale.
     */
    function windIntensityColorScale(step: number, maxWind: number): string[] & { indexFor: (m: number) => number } {
        const result: string[] & { indexFor?: (m: number) => number } = [];
        for (let j = 85; j <= 255; j += step) {
            result.push(asColorStyle(j, j, j, 1.0));
        }
        result.indexFor = function(m: number) {  // map wind speed to a style
            return Math.floor(Math.min(m, maxWind) / maxWind * (result.length - 1));
        };
        return result as string[] & { indexFor: (m: number) => number };
    }

    /**
     * Creates a color scale composed of the specified segments. Segments is an array of two-element arrays of the
     * form [value, color], where value is the point along the scale and color is the [r, g, b] color at that point.
     */
    function segmentedColorScale(segments: [number, RGB][]): (point: number, alpha: number) => RGBA {
        const points: number[] = [];
        const interpolators: ((i: number, a: number) => RGBA)[] = [];
        const ranges: [number, number][] = [];

        for (let i = 0; i < segments.length - 1; i++) {
            points.push(segments[i+1][0]);
            interpolators.push(colorInterpolator(segments[i][1], segments[i+1][1]));
            ranges.push([segments[i][0], segments[i+1][0]]);
        }

        return function(point: number, alpha: number): RGBA {
            let i;
            for (i = 0; i < points.length - 1; i++) {
                if (point <= points[i]) {
                    break;
                }
            }
            const range = ranges[i];
            return interpolators[i](proportion(point, range[0], range[1]), alpha);
        };
    }

    /**
     * Returns a human readable string for the provided coordinates.
     */
    function formatCoordinates(λ: number, φ: number): string {
        return Math.abs(φ).toFixed(2) + "° " + (φ >= 0 ? "N" : "S") + ", " +
            Math.abs(λ).toFixed(2) + "° " + (λ >= 0 ? "E" : "W");
    }

    interface Units {
        conversion: (value: number) => number;
        precision: number;
    }

    /**
     * Returns a human readable string for the provided scalar in the given units.
     */
    function formatScalar(value: number, units: Units): string {
        return units.conversion(value).toFixed(units.precision);
    }

    /**
     * Returns a human readable string for the provided rectangular wind vector in the given units.
     * See http://mst.nerc.ac.uk/wind_vect_convs.html.
     */
    function formatVector(wind: [number, number, number], units: Units): string {
        const d = Math.atan2(-wind[0], -wind[1]) / τ * 360;  // calculate into-the-wind cardinal degrees
        const wd = Math.round((d + 360) % 360 / 5) * 5;  // shift [-180, 180] to [0, 360], and round to nearest 5.
        return wd.toFixed(0) + "° @ " + formatScalar(wind[2], units);
    }

    /**
     * Returns a promise for a JSON resource (URL) fetched via XHR.
     */
    function loadJson(resource: string): Promise<any> {
        return new Promise((resolve, reject) => {
            d3.json(resource).then(resolve).catch(error => {
                if (!error.status) {
                    reject({status: -1, message: "Cannot load resource: " + resource, resource: resource});
                } else {
                    reject({status: error.status, message: error.statusText, resource: resource});
                }
            });
        });
    }

    /**
     * Returns the distortion introduced by the specified projection at the given point.
     */
    function distortion(projection: d3.GeoProjection, λ: number, φ: number, x: number, y: number): [number, number, number, number] {
        const hλ = λ < 0 ? H : -H;
        const hφ = φ < 0 ? H : -H;
        const pλ = projection([λ + hλ, φ]);
        const pφ = projection([λ, φ + hφ]);

        if (!pλ || !pφ) {
            return [0, 0, 0, 0]; // Return zero distortion if projection fails
        }

        // Meridian scale factor (see Snyder, equation 4-3), where R = 1. This handles issue where length of 1° λ
        // changes depending on φ. Without this, there is a pinching effect at the poles.
        const k = Math.cos(φ / 360 * τ);

        return [
            (pλ[0] - x) / hλ / k,
            (pλ[1] - y) / hλ / k,
            (pφ[0] - x) / hφ,
            (pφ[1] - y) / hφ
        ];
    }

    interface Configuration {
        date: string;
        hour: string;
        param?: string;
        surface?: string;
        level?: string;
        projection: string;
        orientation: string;
        overlayType: string;
        showGridPoints: boolean;
        topology: string;
    }

    /**
     * Parses a URL hash fragment:
     *
     * example: "2013/11/14/0900Z/wind/isobaric/1000hPa/orthographic=26.50,-153.00,1430/overlay=off"
     * output: {date: "2013/11/14", hour: "0900", param: "wind", surface: "isobaric", level: "1000hPa",
     *          projection: "orthographic", orientation: "26.50,-153.00,1430", overlayType: "off"}
     */
    function parse(hash: string, projectionNames: any, overlayTypes: any): Configuration {
        let option: RegExpExecArray | null;
        let result = {} as Configuration;
        //             1        2        3          4          5            6      7      8    9
        const tokens = /^(current|(\d{4})\/(\d{1,2})\/(\d{1,2})\/(\d{3,4})Z)\/(\w+)\/(\w+)\/(\w+)([\/].+)?/.exec(hash);
        if (tokens) {
            const date = tokens[1] === "current" ?
                "current" :
                tokens[2] + "/" + (+tokens[3]).toString().padStart(2, '0') + "/" + (+tokens[4]).toString().padStart(2, '0');
            const hour = (tokens[5] != null) ? (+tokens[5]).toString().padStart(4, '0') : "";
            result = {
                date: date,                  // "current" or "yyyy/mm/dd"
                hour: hour,                  // "hhhh" or ""
                param: tokens[6],            // non-empty alphanumeric _
                surface: tokens[7],          // non-empty alphanumeric _
                level: tokens[8],            // non-empty alphanumeric _
                projection: "orthographic",
                orientation: "",
                topology: TOPOLOGY,
                overlayType: "default",
                showGridPoints: false
            };
            (tokens[9] ?? "").split("/").forEach(function(segment) {
                if ((option = /^(\w+)(=([\d\-.,]*))?$/.exec(segment))) {
                    if (projectionNames.has(option[1])) {
                        result.projection = option[1];                 // non-empty alphanumeric _
                        result.orientation = (option[3] ?? "");  // comma delimited string of numbers, or ""
                    }
                }
                else if ((option = /^overlay=(\w+)$/.exec(segment))) {
                    if (overlayTypes.has(option[1]) || option[1] === "default") {
                        result.overlayType = option[1];
                    }
                }
                else if ((option = /^grid=(\w+)$/.exec(segment))) {
                    if (option[1] === "on") {
                        result.showGridPoints = true;
                    }
                }
            });
        }
        return result;
    }

    /**
     * Returns a new configuration object with the properties of the specified configuration merged with the properties
     * of the other configuration. If both configurations define a property, the other configuration's property takes
     * precedence.
     */
    function buildConfiguration(projectionNames: string[], overlayTypes: string[]): Configuration {
        const configuration = parse("", projectionNames, overlayTypes);
        configuration.projection = "orthographic";
        configuration.orientation = "0,0,0";
        configuration.overlayType = "default";
        configuration.showGridPoints = false;
        configuration.topology = TOPOLOGY;
        return configuration;
    }

    return {
        floorMod,
        distance,
        clamp,
        proportion,
        spread,
        isFF,
        isMobile,
        isEmbeddedInIFrame,
        toUTCISO,
        toLocalISO,
        ymdRedelimit,
        dateToUTCymd,
        dateToConfig,
        log,
        view,
        clearCanvas,
        colorInterpolator,
        sinebowColor,
        extendedSinebowColor,
        asColorStyle,
        windIntensityColorScale,
        segmentedColorScale,
        formatCoordinates,
        formatScalar,
        formatVector,
        loadJson,
        distortion,
        parse,
        buildConfiguration
    };
})();

// Export for both module systems and global scope
export default µ;
if (typeof window !== 'undefined') {
    (window as any).µ = µ;
} 