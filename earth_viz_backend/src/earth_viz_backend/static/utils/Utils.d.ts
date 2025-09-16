/**
 * Utils - a collection of utility functions for the earth visualization
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
import * as d3 from 'd3';
import { Point, ViewportSize, RGB, RGBA, DateConfig, Logger } from '../core/Globes';
interface Units {
    conversion: (value: number) => number;
    precision: number;
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
export declare class Utils {
    private static readonly τ;
    private static readonly H;
    private static readonly DEFAULT_CONFIG;
    private static readonly TOPOLOGY;
    /**
     * @returns {Number} returns remainder of floored division, i.e., floor(a / n). Useful for consistent modulo
     *          of negative numbers. See http://en.wikipedia.org/wiki/Modulo_operation.
     */
    static floorMod(a: number, n: number): number;
    /**
     * @returns {Number} distance between two points having the form [x, y].
     */
    static distance(a: Point, b: Point): number;
    /**
     * @returns {Number} the value x clamped to the range [low, high].
     */
    static clamp(x: number, low: number, high: number): number;
    /**
     * @returns {number} the fraction of the bounds [low, high] covered by the value x, after clamping x to the
     *          bounds. For example, given bounds=[10, 20], this method returns 1 for x>=20, 0.5 for x=15 and 0
     *          for x<=10.
     */
    static proportion(x: number, low: number, high: number): number;
    /**
     * @returns {number} the value p within the range [0, 1], scaled to the range [low, high].
     */
    static spread(p: number, low: number, high: number): number;
    /**
     * @returns {Boolean} true if agent is probably firefox. Don't really care if this is accurate.
     */
    static isFF(): boolean;
    /**
     * @returns {Boolean} true if agent is probably a mobile device. Don't really care if this is accurate.
     */
    static isMobile(): boolean;
    static isEmbeddedInIFrame(): boolean;
    static toUTCISO(date: Date): string;
    static toLocalISO(date: Date): string;
    /**
     * @returns {String} the string yyyyfmmfdd as yyyytmmtdd, where f and t are the "from" and "to" delimiters. Either
     *          delimiter may be the empty string.
     */
    static ymdRedelimit(ymd: string, fromDelimiter: string, toDelimiter: string): string;
    /**
     * @returns {String} the UTC year, month, and day of the specified date in yyyyfmmfdd format, where f is the
     *          delimiter (and may be the empty string).
     */
    static dateToUTCymd(date: Date, delimiter?: string): string;
    static dateToConfig(date: Date): DateConfig;
    /**
     * @returns {Object} an object to perform logging, if/when the browser supports it.
     */
    static log(): Logger;
    /**
     * @returns {width: (Number), height: (Number)} an object that describes the size of the browser's current view.
     */
    static view(): ViewportSize;
    /**
     * @returns {Object} clears and returns the specified Canvas element's 2d context.
     */
    static clearCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null;
    /**
     * Creates a color interpolator between two colors.
     */
    static colorInterpolator(start: RGB, end: RGB): (i: number, a: number) => RGBA;
    /**
     * Produces a color style in a rainbow-like trefoil color space. Not quite HSV, but produces a nice
     * spectrum. See http://krazydad.com/tutorials/makecolors.php.
     *
     * @param hue the hue rotation in the range [0, 1]
     * @param a the alpha value in the range [0, 255]
     * @returns {Array} [r, g, b, a]
     */
    static sinebowColor(hue: number, a: number): RGBA;
    /**
     * Interpolates a sinebow color where 0 <= i <= j, then fades to white where j < i <= 1.
     *
     */
    static extendedSinebowColor(i: number, a: number): RGBA;
    static asColorStyle(r: number, g: number, b: number, a: number): string;
    /**
     * @returns {Array} of wind colors and a method, indexFor, that maps wind magnitude to an index on the color scale.
     */
    static windIntensityColorScale(step: number, maxWind: number): string[] & {
        indexFor: (m: number) => number;
    };
    /**
     * Creates a color scale composed of the specified segments. Segments is an array of two-element arrays of the
     * form [value, color], where value is the point along the scale and color is the [r, g, b] color at that point.
     * For example, [[0, [128, 0, 128]], [1, [255, 255, 0]]] creates a scale from purple to yellow. If the first
     * segment's value is not 0, a segment is added with value 0 and the same color. Same for the last segment: if
     * its value is not 1, a segment is added with value 1 and the same color. The scale is then normalized so that
     * points lie between 0 and 1.
     */
    static segmentedColorScale(segments: [number, RGB][]): (point: number, alpha: number) => RGBA;
    /**
     * Returns a human readable string for the provided coordinates.
     */
    static formatCoordinates(λ: number, φ: number): string;
    /**
     * Returns a human readable string for the provided scalar in the given units.
     */
    static formatScalar(value: number, units: Units): string;
    /**
     * Returns a human readable string for the provided rectangular wind vector in the given units.
     * See http://mst.nerc.ac.uk/wind_vect_convs.html.
     */
    static formatVector(wind: [number, number, number], units: Units): string;
    /**
     * Returns a promise for a JSON resource (URL) fetched via XHR.
     */
    static loadJson(resource: string): Promise<any>;
    /**
     * Returns the distortion introduced by the specified projection at the given point.
     */
    static distortion(projection: d3.GeoProjection, λ: number, φ: number, x: number, y: number): [number, number, number, number];
    /**
     * Parses a URL hash fragment:
     *
     * example: "2013/11/14/0900Z/wind/isobaric/1000hPa/orthographic=26.50,-153.00,1430/overlay=off"
     * output: {date: "2013/11/14", hour: "0900", param: "wind", surface: "isobaric", level: "1000hPa",
     *          projection: "orthographic", orientation: "26.50,-153.00,1430", overlayType: "off"}
     */
    static parse(hash: string, projectionNames: any, overlayTypes: any): Configuration;
    /**
     * Returns a new configuration object with the properties of the specified configuration merged with the properties
     * of the other configuration. If both configurations define a property, the other configuration's property takes
     * precedence.
     */
    static buildConfiguration(projectionNames: string[], overlayTypes: string[]): Configuration;
    /**
     * Creates a mask for determining which pixels are visible on the globe
     * @param globe The globe object with defineMask method
     * @param view The viewport size
     * @returns Object with imageData and isVisible method, or null if creation fails
     */
    static createMask(globe: any, view: ViewportSize): any;
    /**
     * Find the center of the mask by calculating the centroid of all visible pixels
     */
    private static findMaskCenter;
}
export {};
//# sourceMappingURL=Utils.d.ts.map