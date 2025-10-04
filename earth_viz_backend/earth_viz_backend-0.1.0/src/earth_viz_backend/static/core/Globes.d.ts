/**
 * Globes - a set of models of the earth, each having their own kind of projection and onscreen behavior.
 *
 * Copyright (c) 2014 Cameron Beccario
 * The MIT License - http://opensource.org/licenses/MIT
 *
 * https://github.com/cambecc/earth
 */
import * as d3 from 'd3';
export type Point = [number, number];
export type GeoPoint = [number, number];
export type Vector = [number, number, number | null];
export interface ViewportSize {
    width: number;
    height: number;
}
export interface Bounds {
    x: number;
    y: number;
    xMax: number;
    yMax: number;
    width: number;
    height: number;
}
export interface DisplayOptions {
    width: number;
    height: number;
    projection: d3.GeoProjection;
    orientation: [number, number, number];
}
declare module 'd3-geo-projection' {
    function geoMollweide(): d3.GeoProjection;
    function geoWinkel3(): d3.GeoProjection;
    function geoPolyhedralWaterman(): d3.GeoProjection;
}
export interface Globe {
    projection: d3.GeoProjection | null;
    projectionType: 'orthographic' | 'equirectangular' | 'azimuthal_equidistant' | 'conic_equidistant' | 'stereographic' | 'waterman' | 'winkel3' | 'atlantis';
    newProjection(view: ViewportSize): d3.GeoProjection;
    bounds(view: ViewportSize): {
        x: number;
        y: number;
        xMax: number;
        yMax: number;
        width: number;
        height: number;
    };
    fit(view: ViewportSize): number;
    center(view: ViewportSize): [number, number];
    scaleExtent(): [number, number];
    orientation(o?: string, view?: ViewportSize): string | Globe;
    manipulator(startMouse: [number, number], startScale: number): {
        move(mouse: [number, number] | null, scale: number): void;
        end(): void;
    };
    locate(coord: [number, number]): [number, number, number] | null;
    defineMask(context: CanvasRenderingContext2D): CanvasRenderingContext2D;
    defineMap(mapSvg: any, foregroundSvg: any): void;
}
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export interface DateConfig {
    date: string;
    hour: string;
}
export interface Logger {
    debug: (s: unknown) => void;
    info: (s: unknown) => void;
    error: (e: unknown) => void;
    time: (s: unknown) => void;
    timeEnd: (s: unknown) => void;
}
export declare class Globes {
    private static currentPosition;
    private static ensureNumber;
    /**
     * Ensure the given scale results in even globe dimensions to avoid half-pixel alignment issues
     */
    private static ensureEvenScale;
    private static clampedBounds;
    private static standardGlobe;
    private static newGlobe;
    static atlantis(): Globe;
    static azimuthal_equidistant(): Globe;
    static conic_equidistant(): Globe;
    static equirectangular(): Globe;
    static orthographic(): Globe;
    static stereographic(): Globe;
    static waterman(): Globe;
    static winkel3(): Globe;
    static get(name: string): (() => Globe) | undefined;
    static keys(): string[];
}
//# sourceMappingURL=Globes.d.ts.map